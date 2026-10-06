import type { HandlerEvent } from "@netlify/functions";
import { and, eq, inArray, lt, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db";
import { dbGameToGameData, resolveActiveSeasonId } from "../espn/sync";
import {
  pickCorrectness,
  unitsDelta,
  computeWinPct,
  isGradedForStandings,
  isWeekClosed,
  missedStars,
} from "../../shared/scoring";
import { compareSeasonWeeks } from "../../shared/statsCompute";
import type { GameData, LeaderboardEntry, PickSide } from "../../shared/types";
import { publicDisplayName } from "../../shared/userDisplay";
import {
  badgeDescription,
  badgeName,
  isDisplayableBadgeAward,
  isSeasonScopedBadge,
  SEASON_BADGE_WEEK,
} from "../../shared/badges";
import { json } from "./http";

/** P/L sums are floats; closer than this counts as a tie. */
const PL_EPS = 1e-9;

/**
 * Deterministic board order: win % desc, ★ P/L desc, correct desc, then display name
 * (case-insensitive) and userId as final tie-breakers so equal rows never shuffle.
 */
export function compareLeaderboardEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.winPct !== a.winPct) return b.winPct - a.winPct;
  if (Math.abs(b.confidencePl - a.confidencePl) > PL_EPS) return b.confidencePl - a.confidencePl;
  if (b.correct !== a.correct) return b.correct - a.correct;
  const an = a.displayName.toLowerCase();
  const bn = b.displayName.toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

export type LeaderboardPick = {
  userId: string;
  /** Public (ESPN) game id, matching GameData.id. */
  gameId: string;
  pick: PickSide;
  isConfidenceBet: boolean;
};

/** No ★ in this many closed weeks in a row = dropped out of the season ★ P/L board. */
const DROPOUT_WEEKS = 3;

/**
 * Pure leaderboard math. `games` are the games in scope (season or one week);
 * `picks` are the picks on those games. Each game's graded data is computed once.
 *
 * ★ P/L: units on the ★ bets placed, minus 1 for every ★ not placed in a closed regular-season
 * week. It counts from the player's first week with a pick — `joinedBefore` names the players
 * who picked in a week before the ones in scope (weekly board).
 */
export function buildLeaderboardEntries(
  users: Array<{ id: string; username: string; displayName: string | null }>,
  games: GameData[],
  picks: LeaderboardPick[],
  opts: { weekly: boolean; now?: Date; joinedBefore?: ReadonlySet<string> },
): LeaderboardEntry[] {
  type GameInfo = { g: GameData; graded: boolean; weekKey: string };
  type WeekInfo = {
    key: string;
    seasonType: number;
    weekNumber: number;
    phase: GameData["phase"];
    games: GameData[];
    closed: boolean;
  };
  const gameInfo = new Map<string, GameInfo>();
  const weekByKey = new Map<string, WeekInfo>();
  let gradedTotal = 0;
  for (const g of games) {
    const weekKey = `${g.seasonType}-${g.weekNumber}`;
    const graded = isGradedForStandings(g);
    if (graded) gradedTotal++;
    gameInfo.set(g.id, { g, graded, weekKey });
    let week = weekByKey.get(weekKey);
    if (!week) {
      week = { key: weekKey, seasonType: g.seasonType, weekNumber: g.weekNumber, phase: g.phase, games: [], closed: false };
      weekByKey.set(weekKey, week);
    }
    week.games.push(g);
  }
  const now = opts.now ?? new Date();
  const weeks = [...weekByKey.values()].sort(compareSeasonWeeks);
  for (const w of weeks) w.closed = isWeekClosed(w.games, now);

  const picksByUser = new Map<string, LeaderboardPick[]>();
  for (const p of picks) {
    if (!gameInfo.has(p.gameId)) continue;
    let list = picksByUser.get(p.userId);
    if (!list) {
      list = [];
      picksByUser.set(p.userId, list);
    }
    list.push(p);
  }

  const entries: LeaderboardEntry[] = [];
  for (const u of users) {
    let correct = 0;
    // ★ bets count as placed even before the game is final; P/L only sums finals.
    const weekStats = new Map<string, { picks: number; count: number; rawPl: number; confCorrect: number; confGraded: number }>();

    for (const p of picksByUser.get(u.id) ?? []) {
      const { g, graded, weekKey } = gameInfo.get(p.gameId)!;
      if (graded) correct += pickCorrectness(p.pick, g.atsResult);
      const ws = weekStats.get(weekKey) ?? { picks: 0, count: 0, rawPl: 0, confCorrect: 0, confGraded: 0 };
      weekStats.set(weekKey, ws);
      ws.picks++;
      if (!p.isConfidenceBet) continue;
      ws.count++;
      if (graded) {
        if (g.spread != null && g.favoriteSide && g.atsResult) {
          ws.rawPl += unitsDelta(p.pick, g.atsResult, g.favoriteSide, g.oddsAway, g.oddsHome);
        }
        ws.confGraded++;
        ws.confCorrect += pickCorrectness(p.pick, g.atsResult);
      }
    }

    let joined = opts.joinedBefore?.has(u.id) ?? false;
    let confidencePl = 0;
    let confCorrect = 0;
    let confTotal = 0;
    let weeksComplete = 0;
    let missed = 0;
    let stars = 0;
    let openWeekStars = 0;
    /** Per closed week, oldest first: joined by then but placed no ★. */
    const starless: boolean[] = [];
    for (const w of weeks) {
      const ws = weekStats.get(w.key);
      if (ws && ws.picks > 0) joined = true;
      const count = ws?.count ?? 0;
      if (w.closed) starless.push(joined && count === 0);
      if (!joined) continue;
      const short = missedStars(w.phase, count);
      stars += count;
      if (!w.closed) openWeekStars += count;
      confidencePl += ws?.rawPl ?? 0;
      confCorrect += ws?.confCorrect ?? 0;
      confTotal += ws?.confGraded ?? 0;
      if (w.closed) {
        confidencePl -= short;
        missed += short;
      }
      if (count > 0 && short === 0) weeksComplete++;
    }

    const total = gradedTotal;
    // Skip users with no graded games in a weekly board (keeps mini board clean)
    if (opts.weekly && total === 0 && confidencePl === 0) continue;

    // Weekly: no ★ in the (closed) week. Season: no ★ in the last few closed weeks and none placed since.
    const idle = opts.weekly
      ? stars === 0 && weeks.every((w) => w.closed)
      : openWeekStars === 0 &&
        starless.length >= DROPOUT_WEEKS &&
        starless.slice(-DROPOUT_WEEKS).every(Boolean);

    entries.push({
      userId: u.id,
      username: u.username,
      displayName: publicDisplayName(u),
      winPct: computeWinPct(correct, total),
      correct,
      total,
      confCorrect,
      confTotal,
      confidencePl,
      weeksComplete,
      missedStars: missed,
      plStatus: !joined ? "off" : idle ? "idle" : "ranked",
    });
  }

  return entries.sort(compareLeaderboardEntries);
}

export async function computeLeaderboard(filter?: {
  seasonType: number;
  week: number;
}): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();

  const weekConds: SQL[] = seasonId ? [eq(schema.weeks.seasonId, seasonId)] : [];
  if (filter) {
    weekConds.push(eq(schema.weeks.seasonType, filter.seasonType));
    weekConds.push(eq(schema.weeks.weekNumber, filter.week));
  }
  const badgeWhere = filter
    ? and(
        eq(schema.userBadges.seasonType, filter.seasonType),
        inArray(schema.userBadges.weekNumber, [filter.week, SEASON_BADGE_WEEK]),
      )
    : undefined;

  const [activeUsers, gameRows, pickRows, earlierPickers, badgeRows] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.isBanned, false)),
    seasonId
      ? db
          .select({ game: schema.games, week: schema.weeks })
          .from(schema.games)
          .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
          .where(and(...weekConds))
      : Promise.resolve([]),
    seasonId
      ? db
          .select({
            userId: schema.picks.userId,
            gameId: schema.games.espnEventId,
            pick: schema.picks.pick,
            isConfidenceBet: schema.picks.isConfidenceBet,
          })
          .from(schema.picks)
          .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
          .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
          .where(and(...weekConds))
      : Promise.resolve([]),
    // Weekly board: who had already picked in an earlier week (★ P/L counts from a player's first pick).
    seasonId && filter
      ? db
          .selectDistinct({ userId: schema.picks.userId })
          .from(schema.picks)
          .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
          .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
          .where(
            and(
              eq(schema.weeks.seasonId, seasonId),
              or(
                lt(schema.weeks.seasonType, filter.seasonType),
                and(eq(schema.weeks.seasonType, filter.seasonType), lt(schema.weeks.weekNumber, filter.week)),
              ),
            ),
          )
      : Promise.resolve([]),
    db
      .select()
      .from(schema.userBadges)
      .where(badgeWhere)
      .catch(() => [] as Array<typeof schema.userBadges.$inferSelect>),
  ]);

  const games = gameRows.map(({ game, week }) => dbGameToGameData(game, week));
  const entries = buildLeaderboardEntries(activeUsers, games, pickRows, {
    weekly: !!filter,
    joinedBefore: new Set(earlierPickers.map((p) => p.userId)),
  });

  const badgesByUser = new Map<string, typeof badgeRows>();
  for (const b of badgeRows) {
    if (!isDisplayableBadgeAward(b.badgeId, b.weekNumber)) continue;
    const list = badgesByUser.get(b.userId) ?? [];
    list.push(b);
    badgesByUser.set(b.userId, list);
  }
  for (const entry of entries) {
    entry.badges = (badgesByUser.get(entry.userId) ?? []).map((b) => ({
      badgeId: b.badgeId,
      name: badgeName(b.badgeId),
      description: badgeDescription(b.badgeId),
      seasonType: b.seasonType,
      weekNumber: isSeasonScopedBadge(b.weekNumber) ? null : b.weekNumber,
      earnedAt: b.earnedAt.toISOString(),
    }));
  }

  return entries;
}

export async function handleLeaderboard(event: HandlerEvent) {
  const params = event.queryStringParameters ?? {};
  const seasonType = params.seasonType != null ? Number(params.seasonType) : null;
  const week = params.week != null ? Number(params.week) : null;
  const filter =
    seasonType != null && week != null && Number.isFinite(seasonType) && Number.isFinite(week)
      ? { seasonType, week }
      : undefined;
  const entries = await computeLeaderboard(filter);
  return json(200, { entries, scope: filter ? "week" : "overall", ...filter });
}
