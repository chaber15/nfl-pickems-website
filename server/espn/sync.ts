import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import {
  fetchScoreboard,
  fetchCurrentScoreboard,
  applyAtsToGame,
  type ScoreboardOptions,
} from "../../shared/espnClient";
import {
  computeLineLockAt,
  hasCompleteLine,
  isPastLineLock,
  normalizePickemLine,
  resolveLineFields,
  shouldSwapPicksForFavoriteFlip,
  snapshotLine,
  type LineSnapshot,
} from "../../shared/lineLock";
import { computeAtsResult } from "../../shared/scoring";
import type { AtsResult, GameData } from "../../shared/types";
import { sortGamesLiveFirstThenChronological } from "../../shared/gameOrder";
import { isValidPickemsWeek, phaseFor } from "../../shared/weekUtils";

type GameRow = typeof schema.games.$inferSelect;

/** Don't hit ESPN on every page load while games are live. */
export const READ_REFRESH_MIN_MS = 5 * 60 * 1000;
/** Read-triggered sync starts this long before a kickoff. */
export const READ_SYNC_KICKOFF_LEAD_MS = 10 * 60 * 1000;
/**
 * A game still not final this long after kickoff is postponed/canceled (ESPN moves real
 * reschedules to a new date) — stop polling for it.
 */
export const STALE_UNFINISHED_MS = 3 * 24 * 60 * 60 * 1000;

function spreadToCents(spread: number | null): number | null {
  if (spread == null || !Number.isFinite(spread)) return null;
  return Math.round(spread * 10);
}

function centsToSpread(cents: number | null): number | null {
  if (cents == null) return null;
  return cents / 10;
}

export function dbGameToGameData(
  game: typeof schema.games.$inferSelect,
  week: typeof schema.weeks.$inferSelect,
): GameData {
  const line = normalizePickemLine({
    spread: centsToSpread(game.spread),
    favoriteSide: game.favoriteSide,
    oddsAway: game.oddsAway,
    oddsHome: game.oddsHome,
  });
  const base: GameData = {
    id: game.espnEventId,
    espnEventId: game.espnEventId,
    awayTeam: game.awayTeam,
    awayAbbrev: game.awayAbbrev,
    homeTeam: game.homeTeam,
    homeAbbrev: game.homeAbbrev,
    awayRecord: game.awayRecord,
    homeRecord: game.homeRecord,
    kickoffAt: game.kickoffAt.toISOString(),
    spread: line.spread,
    favoriteSide: line.favoriteSide,
    oddsAway: line.oddsAway,
    oddsHome: line.oddsHome,
    atsResult: game.atsResult,
    status: game.status,
    awayScore: game.awayScore ?? undefined,
    homeScore: game.homeScore ?? undefined,
    period: game.period,
    displayClock: game.displayClock,
    statusDetail: game.statusDetail,
    preOtAwayScore: game.preOtAwayScore,
    preOtHomeScore: game.preOtHomeScore,
    weekNumber: week.weekNumber,
    seasonType: week.seasonType,
    phase: week.phase,
  };
  return applyAtsToGame(base);
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function ensureSeasonYear(year: number) {
  const db = getDb();
  const select = async () =>
    (await db.select().from(schema.seasons).where(eq(schema.seasons.year, year)).limit(1))[0];
  const existing = await select();
  if (existing) return existing;
  try {
    const [created] = await db
      .insert(schema.seasons)
      .values({ year, label: `${year} NFL Season` })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  // Lost a race with a concurrent sync (unique seasons.year) — use the winner's row.
  const raced = await select();
  if (!raced) throw new Error(`Could not create season ${year}`);
  return raced;
}

async function ensureWeek(seasonId: string, weekNumber: number, seasonType: number, phase: GameData["phase"]) {
  const db = getDb();
  const [row] = await db
    .insert(schema.weeks)
    .values({ seasonId, weekNumber, seasonType, phase })
    .onConflictDoUpdate({
      target: [schema.weeks.seasonId, schema.weeks.weekNumber, schema.weeks.seasonType],
      set: { phase },
    })
    .returning();
  return row!;
}

function existingLineSnapshot(game: GameRow): LineSnapshot {
  return {
    spread: centsToSpread(game.spread),
    favoriteSide: game.favoriteSide,
    oddsAway: game.oddsAway,
    oddsHome: game.oddsHome,
  };
}

type LiveState = {
  status: GameData["status"];
  awayScore: number | null;
  homeScore: number | null;
  atsResult: AtsResult;
  period: number | null;
  displayClock: string | null;
  statusDetail: string | null;
};

/**
 * Merge ESPN's incoming game state with the stored row. Write-safety rules:
 * - a stored final never moves back to in_progress / scheduled (the stored result is kept);
 * - a stored non-null score is never overwritten with null;
 * - a final game's stored atsResult is only replaced by a recompute from complete data
 *   (scores + spread + favorite), never cleared.
 * `line` is the already-resolved (lock-aware) line.
 */
export function mergeGameState(
  existing: Pick<
    GameRow,
    "status" | "awayScore" | "homeScore" | "atsResult" | "period" | "displayClock" | "statusDetail"
  > | null | undefined,
  incoming: Pick<GameData, "status" | "awayScore" | "homeScore" | "period" | "displayClock" | "statusDetail">,
  line: Pick<LineSnapshot, "spread" | "favoriteSide">,
): LiveState {
  const grade = (away: number | null, home: number | null, fallback: AtsResult): AtsResult => {
    if (away == null || home == null || line.spread == null || line.favoriteSide == null) return fallback;
    return computeAtsResult(home, away, line.spread, line.favoriteSide);
  };

  if (existing?.status === "final" && incoming.status !== "final") {
    return {
      status: "final",
      awayScore: existing.awayScore,
      homeScore: existing.homeScore,
      atsResult: grade(existing.awayScore, existing.homeScore, existing.atsResult),
      period: existing.period,
      displayClock: existing.displayClock,
      statusDetail: existing.statusDetail,
    };
  }

  const awayScore = incoming.awayScore ?? existing?.awayScore ?? null;
  const homeScore = incoming.homeScore ?? existing?.homeScore ?? null;
  const atsResult =
    incoming.status === "final"
      ? grade(awayScore, homeScore, existing?.status === "final" ? existing.atsResult : null)
      : null;

  return {
    status: incoming.status,
    awayScore,
    homeScore,
    atsResult,
    period: incoming.period ?? null,
    displayClock: incoming.displayClock ?? null,
    statusDetail: incoming.statusDetail ?? null,
  };
}

const OT_DETAIL = /\bOT\b|\bovertime\b/i;
const END_OF_REGULATION_DETAIL = /^end of (q4|4th|regulation)/i;

function isInOvertime(g: { period?: number | null; statusDetail?: string | null }): boolean {
  if (g.period != null && g.period >= 5) return true;
  return OT_DETAIL.test(g.statusDetail ?? "");
}

function isEndOfRegulationTied(g: {
  period?: number | null;
  statusDetail?: string | null;
  awayScore: number | null;
  homeScore: number | null;
}): boolean {
  return (
    g.period === 4 &&
    END_OF_REGULATION_DETAIL.test((g.statusDetail ?? "").trim()) &&
    g.awayScore != null &&
    g.awayScore === g.homeScore
  );
}

/**
 * Snapshot the regulation score (for the OT Hero badge): at "End of Q4" with a tie, or the
 * first time we see OT (preferring the last stored pre-OT score).
 */
export function resolvePreOtScores(
  existing: Pick<GameRow, "preOtAwayScore" | "preOtHomeScore" | "awayScore" | "homeScore" | "period" | "statusDetail"> | undefined,
  current: { period?: number | null; statusDetail?: string | null; awayScore: number | null; homeScore: number | null },
): { preOtAwayScore: number | null; preOtHomeScore: number | null } {
  const keptAway = existing?.preOtAwayScore ?? null;
  const keptHome = existing?.preOtHomeScore ?? null;
  if (keptAway != null && keptHome != null) {
    return { preOtAwayScore: keptAway, preOtHomeScore: keptHome };
  }
  if (isEndOfRegulationTied(current)) {
    return { preOtAwayScore: current.awayScore, preOtHomeScore: current.homeScore };
  }
  if (!isInOvertime(current) || current.awayScore == null || current.homeScore == null) {
    return { preOtAwayScore: keptAway, preOtHomeScore: keptHome };
  }
  // Prefer last known regulation scores from DB before OT started.
  if (
    existing &&
    existing.awayScore != null &&
    existing.homeScore != null &&
    !isInOvertime(existing)
  ) {
    return { preOtAwayScore: existing.awayScore, preOtHomeScore: existing.homeScore };
  }
  return { preOtAwayScore: current.awayScore, preOtHomeScore: current.homeScore };
}

/** Active season for queries — prefers site_settings.currentSeasonId, else newest year. */
export async function resolveActiveSeasonId(): Promise<string | null> {
  const db = getDb();
  const [settings] = await db.select().from(schema.siteSettings).limit(1);
  if (settings?.currentSeasonId) return settings.currentSeasonId;
  const [latest] = await db.select().from(schema.seasons).orderBy(desc(schema.seasons.year)).limit(1);
  return latest?.id ?? null;
}

export async function findWeekRow(seasonType: number, weekNumber: number) {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return null;
  const [weekRow] = await db
    .select()
    .from(schema.weeks)
    .where(
      and(
        eq(schema.weeks.seasonId, seasonId),
        eq(schema.weeks.seasonType, seasonType),
        eq(schema.weeks.weekNumber, weekNumber),
      ),
    )
    .limit(1);
  return weekRow ?? null;
}

export async function syncEspnWeek(seasonType?: number, week?: number) {
  const db = getDb();
  const now = new Date();

  // Stored rows for the board's events, loaded once (inside the odds-skip hook so we can
  // skip odds lookups for games past line lock whose stored line is complete).
  const existingByEvent = new Map<string, GameRow>();
  let loadedExisting = false;
  const loadExisting = async (eventIds: string[]) => {
    loadedExisting = true;
    if (eventIds.length === 0) return;
    const rows = await db.select().from(schema.games).where(inArray(schema.games.espnEventId, eventIds));
    for (const r of rows) existingByEvent.set(r.espnEventId, r);
  };
  const opts: ScoreboardOptions = {
    skipOddsFallback: async (events) => {
      await loadExisting(events.map((e) => e.eventId));
      if (!isPastLineLock(computeLineLockAt(events.map((e) => e.kickoffAt)), now)) return new Set();
      return new Set(
        events
          .filter((e) => {
            const row = existingByEvent.get(e.eventId);
            return row != null && hasCompleteLine(existingLineSnapshot(row));
          })
          .map((e) => e.eventId),
      );
    },
  };

  const board =
    seasonType != null && week != null
      ? await fetchScoreboard(seasonType, week, opts)
      : await fetchCurrentScoreboard(opts);
  if (!loadedExisting) await loadExisting(board.games.map((g) => g.espnEventId));

  const lockAt = computeLineLockAt(board.games.map((g) => g.kickoffAt));
  const pastLock = isPastLineLock(lockAt, now);
  const result = {
    upserted: 0,
    picksSwapped: 0,
    week: board.week,
    seasonType: board.seasonType,
    seasonYear: board.seasonYear,
    linesLocked: pastLock,
    lockAt: lockAt?.toISOString() ?? null,
  };
  // Nothing to store — don't create empty season / week rows.
  if (board.games.length === 0) return result;

  const season = await ensureSeasonYear(board.seasonYear);

  // Only pin the active season when syncing ESPN's current slate — not when an
  // admin (or on-read path) syncs an arbitrary historical week.
  const pinActiveSeason = seasonType == null || week == null;
  if (pinActiveSeason) {
    await db
      .insert(schema.siteSettings)
      .values({ id: 1, currentSeasonId: season.id })
      .onConflictDoUpdate({ target: schema.siteSettings.id, set: { currentSeasonId: season.id } });
  }

  const weekRow = await ensureWeek(
    season.id,
    board.week,
    board.seasonType,
    phaseFor(board.seasonType, board.week),
  );

  type Stmt = Parameters<typeof db.batch>[0][number];
  const statements: Stmt[] = [];

  for (const g of board.games) {
    try {
      const existing = existingByEvent.get(g.espnEventId);
      const existingSnap = existing ? existingLineSnapshot(existing) : null;
      const line = resolveLineFields(existingSnap, snapshotLine(g), pastLock);
      const state = mergeGameState(existing, g, line);
      const preOt = resolvePreOtScores(existing, state);
      const kickoffAt = new Date(g.kickoffAt);
      if (!Number.isFinite(kickoffAt.getTime())) continue;

      const values = {
        weekId: weekRow.id,
        espnEventId: g.espnEventId,
        awayTeam: g.awayTeam,
        awayAbbrev: g.awayAbbrev,
        homeTeam: g.homeTeam,
        homeAbbrev: g.homeAbbrev,
        awayRecord: g.awayRecord ?? existing?.awayRecord ?? null,
        homeRecord: g.homeRecord ?? existing?.homeRecord ?? null,
        kickoffAt,
        spread: spreadToCents(line.spread),
        favoriteSide: line.favoriteSide,
        oddsAway: line.oddsAway,
        oddsHome: line.oddsHome,
        ...state,
        preOtAwayScore: preOt.preOtAwayScore,
        preOtHomeScore: preOt.preOtHomeScore,
        updatedAt: now,
      };

      statements.push(
        db
          .insert(schema.games)
          .values(values)
          .onConflictDoUpdate({ target: schema.games.espnEventId, set: values }),
      );

      // Favorite flipped home↔away (pre-lock line move): swap stored picks in the same
      // transaction so every user keeps the TEAM they tapped.
      if (existing && shouldSwapPicksForFavoriteFlip(existing.favoriteSide, line.favoriteSide)) {
        statements.push(
          db
            .update(schema.picks)
            .set({
              pick: sql`case ${schema.picks.pick} when 'favorite' then 'underdog'::pick_side else 'favorite'::pick_side end`,
              updatedAt: sql`now()`,
            })
            .where(eq(schema.picks.gameId, existing.id)),
        );
        result.picksSwapped++;
        console.log(
          `ESPN sync: favorite flipped ${existing.favoriteSide}→${line.favoriteSide} for ${g.awayAbbrev}@${g.homeAbbrev}; swapped picks`,
        );
      }
      result.upserted++;
    } catch (err) {
      console.error(`ESPN sync: skipped event ${g.espnEventId}:`, err);
    }
  }

  if (statements.length > 0) {
    // neon-http batch = one HTTP round trip, one transaction.
    await db.batch(statements as [Stmt, ...Stmt[]]);
  }

  return result;
}


export async function getGamesForWeek(seasonType: number, weekNumber: number): Promise<GameData[]> {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return [];

  const rows = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(
      and(
        eq(schema.weeks.seasonId, seasonId),
        eq(schema.weeks.seasonType, seasonType),
        eq(schema.weeks.weekNumber, weekNumber),
      ),
    )
    .orderBy(asc(schema.games.kickoffAt));

  return sortGamesLiveFirstThenChronological(
    rows.map(({ game, week }) => dbGameToGameData(game, week)),
  );
}

export type ReadSyncRow = { status: string; kickoffAt: Date; updatedAt: Date };

/**
 * Pure decision for read-triggered sync (kickoff-aware, any day of the week):
 * - no rows yet → bootstrap;
 * - some game kicks off within 10 min (or already has) and isn't final → refresh,
 *   throttled to once per 5 min by the newest updated_at.
 */
export function decideReadSync(rows: readonly ReadSyncRow[], now: Date): boolean {
  if (rows.length === 0) return true;
  const t = now.getTime();
  const active = rows.some((r) => {
    if (r.status === "final") return false;
    const k = r.kickoffAt.getTime();
    return k <= t + READ_SYNC_KICKOFF_LEAD_MS && k > t - STALE_UNFINISHED_MS;
  });
  if (!active) return false;
  const newest = Math.max(...rows.map((r) => r.updatedAt.getTime()));
  return t - newest >= READ_REFRESH_MIN_MS;
}

/** Whether a games GET should trigger ESPN sync on the request path. */
export async function shouldSyncWeekOnRead(seasonType: number, weekNumber: number): Promise<boolean> {
  if (!isValidPickemsWeek(seasonType, weekNumber)) return false;
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return true;

  const rows = await db
    .select({
      status: schema.games.status,
      kickoffAt: schema.games.kickoffAt,
      updatedAt: schema.games.updatedAt,
    })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(
      and(
        eq(schema.weeks.seasonId, seasonId),
        eq(schema.weeks.seasonType, seasonType),
        eq(schema.weeks.weekNumber, weekNumber),
      ),
    );

  return decideReadSync(rows, new Date());
}

/** Games (+ week) for the active season only — used by leaderboard/history/stats. */
export async function getActiveSeasonGameRows() {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return [];

  return db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(eq(schema.weeks.seasonId, seasonId));
}
