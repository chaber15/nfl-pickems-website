import { eq, and, desc } from "drizzle-orm";
import { getDb, schema } from "../db";
import {
  fetchScoreboard,
  fetchCurrentScoreboard,
  applyAtsToGame,
  detectCurrentWeek,
} from "../../shared/espnClient";
import {
  computeLineLockAt,
  isPastLineLock,
  resolveLineFields,
  snapshotLine,
  type LineSnapshot,
} from "../../shared/lineLock";
import type { GameData } from "../../shared/types";

/** Don't hit ESPN on every page load while games are live. */
const READ_REFRESH_MIN_MS = 5 * 60 * 1000;

function spreadToCents(spread: number | null): number | null {
  if (spread == null) return null;
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
  const spread = centsToSpread(game.spread);
  const base: GameData = {
    id: game.espnEventId,
    espnEventId: game.espnEventId,
    awayTeam: game.awayTeam,
    awayAbbrev: game.awayAbbrev,
    homeTeam: game.homeTeam,
    homeAbbrev: game.homeAbbrev,
    kickoffAt: game.kickoffAt.toISOString(),
    spread,
    favoriteSide: game.favoriteSide,
    oddsAway: game.oddsAway,
    oddsHome: game.oddsHome,
    atsResult: game.atsResult,
    status: game.status,
    awayScore: game.awayScore ?? undefined,
    homeScore: game.homeScore ?? undefined,
    weekNumber: week.weekNumber,
    seasonType: week.seasonType,
    phase: week.phase,
  };
  return applyAtsToGame(base);
}

async function ensureSeasonYear(year: number) {
  const db = getDb();
  const [existing] = await db.select().from(schema.seasons).where(eq(schema.seasons.year, year)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.seasons)
    .values({ year, label: `${year} NFL Season` })
    .returning();
  return created;
}

async function ensureWeek(seasonId: string, weekNumber: number, seasonType: number, phase: GameData["phase"]) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.weeks)
    .where(
      and(
        eq(schema.weeks.seasonId, seasonId),
        eq(schema.weeks.weekNumber, weekNumber),
        eq(schema.weeks.seasonType, seasonType),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.weeks)
    .values({ seasonId, weekNumber, seasonType, phase })
    .returning();
  return created;
}

function existingLineSnapshot(game: typeof schema.games.$inferSelect): LineSnapshot {
  return {
    spread: centsToSpread(game.spread),
    favoriteSide: game.favoriteSide,
    oddsAway: game.oddsAway,
    oddsHome: game.oddsHome,
  };
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

/** Prior slate to keep grading when ESPN has already rolled the "current" week. */
export function previousSlate(
  seasonType: number,
  week: number,
): { seasonType: number; week: number } | null {
  if (week > 1) return { seasonType, week: week - 1 };
  if (seasonType === 3) return { seasonType: 2, week: 18 };
  return null;
}

export async function syncEspnWeek(seasonType?: number, week?: number) {
  const board =
    seasonType != null && week != null
      ? await fetchScoreboard(seasonType, week)
      : await fetchCurrentScoreboard();

  const db = getDb();
  const season = await ensureSeasonYear(board.seasonYear);

  const [settings] = await db.select().from(schema.siteSettings).limit(1);
  if (!settings) {
    await db.insert(schema.siteSettings).values({ currentSeasonId: season.id });
  } else {
    await db
      .update(schema.siteSettings)
      .set({ currentSeasonId: season.id })
      .where(eq(schema.siteSettings.id, 1));
  }

  const weekRow = await ensureWeek(season.id, board.week, board.seasonType, board.games[0]?.phase ?? "regular");
  const lockAt = computeLineLockAt(board.games.map((g) => g.kickoffAt));
  const pastLock = isPastLineLock(lockAt);

  let upserted = 0;
  for (const g of board.games) {
    const [existing] = await db.select().from(schema.games).where(eq(schema.games.espnEventId, g.espnEventId)).limit(1);
    const incoming = snapshotLine(g);
    const existingSnap = existing ? existingLineSnapshot(existing) : null;
    const lockedLine = resolveLineFields(existingSnap, incoming, pastLock);
    const graded = applyAtsToGame({
      ...g,
      spread: lockedLine.spread,
      favoriteSide: lockedLine.favoriteSide,
      oddsAway: lockedLine.oddsAway,
      oddsHome: lockedLine.oddsHome,
    });

    const values = {
      weekId: weekRow.id,
      espnEventId: graded.espnEventId,
      awayTeam: graded.awayTeam,
      awayAbbrev: graded.awayAbbrev,
      homeTeam: graded.homeTeam,
      homeAbbrev: graded.homeAbbrev,
      kickoffAt: new Date(graded.kickoffAt),
      spread: spreadToCents(graded.spread),
      favoriteSide: graded.favoriteSide,
      oddsAway: graded.oddsAway,
      oddsHome: graded.oddsHome,
      atsResult: graded.atsResult === null ? null : graded.atsResult,
      status: graded.status,
      awayScore: graded.awayScore ?? null,
      homeScore: graded.homeScore ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(schema.games).set(values).where(eq(schema.games.id, existing.id));
    } else {
      await db.insert(schema.games).values(values);
    }
    upserted++;
  }

  return {
    upserted,
    week: board.week,
    seasonType: board.seasonType,
    seasonYear: board.seasonYear,
    linesLocked: pastLock,
    lockAt: lockAt?.toISOString() ?? null,
  };
}

/**
 * Cron entry: refresh ESPN's current week, and the previous week if it still
 * has non-final games (covers Monday Night after the calendar rolls).
 */
export async function syncScheduledSlates() {
  const current = await detectCurrentWeek();
  const primary = await syncEspnWeek(current.seasonType, current.week);

  const prev = previousSlate(current.seasonType, current.week);
  let secondary: Awaited<ReturnType<typeof syncEspnWeek>> | null = null;
  if (prev) {
    const prevGames = await getGamesForWeek(prev.seasonType, prev.week);
    if (prevGames.length === 0 || prevGames.some((g) => g.status !== "final")) {
      secondary = await syncEspnWeek(prev.seasonType, prev.week);
    }
  }

  return { current: primary, previous: secondary };
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
    );

  return rows.map(({ game, week }) => dbGameToGameData(game, week));
}

/** True when the slate is missing or has non-final games older than the refresh window. */
export async function weekNeedsEspnRefresh(seasonType: number, weekNumber: number): Promise<boolean> {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return true;

  const rows = await db
    .select({ status: schema.games.status, updatedAt: schema.games.updatedAt })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(
      and(
        eq(schema.weeks.seasonId, seasonId),
        eq(schema.weeks.seasonType, seasonType),
        eq(schema.weeks.weekNumber, weekNumber),
      ),
    );

  if (rows.length === 0) return true;
  if (rows.every((r) => r.status === "final")) return false;

  const newest = Math.max(...rows.map((r) => r.updatedAt.getTime()));
  return Date.now() - newest >= READ_REFRESH_MIN_MS;
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
