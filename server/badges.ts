import { and, eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { getDb, schema } from "./db";
import {
  evaluateWeekBadges,
  countLifetimeBadgeEvents,
  LIFETIME_BADGE_THRESHOLDS,
  SEASON_BADGE_WEEK,
  weekAtsRecord,
  weekConfWinPct,
  type BadgeAward,
  type LifetimeBadgeCounts,
} from "../shared/badges";
import { confidencePlForWeek } from "../shared/statsCompute";
import type { GameData, UserPick, WeekComparePlayer } from "../shared/types";
import { getActiveSeasonGameRows, getGamesForWeek } from "./espn/sync";
import { isGradedForStandings } from "../shared/scoring";

/** True when every game on the slate is final (week-scoped badges need the full week). */
function isWeekFullyComplete(games: GameData[]): boolean {
  return games.length > 0 && games.every((g) => g.status === "final");
}

async function loadUserPicksMap(
  userId: string,
  gameRows: Array<{ game: typeof schema.games.$inferSelect }>,
): Promise<Record<string, UserPick>> {
  const db = getDb();
  const userPicks = await db.select().from(schema.picks).where(eq(schema.picks.userId, userId));
  const espnByDbId = new Map(gameRows.map(({ game }) => [game.id, game.espnEventId]));
  const picks: Record<string, UserPick> = {};
  for (const p of userPicks) {
    const publicId = espnByDbId.get(p.gameId);
    if (!publicId) continue;
    picks[publicId] = {
      gameId: publicId,
      pick: p.pick,
      isConfidenceBet: p.isConfidenceBet,
    };
  }
  return picks;
}

function streakEndingAt(weekWinPctsOldestFirst: number[]): number {
  let streak = 0;
  for (let i = weekWinPctsOldestFirst.length - 1; i >= 0; i--) {
    if (weekWinPctsOldestFirst[i]! > 50) streak++;
    else break;
  }
  return streak;
}

async function userHasBadge(userId: string, badgeId: string): Promise<boolean> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.userBadges)
      .where(and(eq(schema.userBadges.userId, userId), eq(schema.userBadges.badgeId, badgeId)))
      .limit(1);
    return !!row;
  } catch {
    /* table missing until db:push */
    return false;
  }
}

async function insertAwards(userId: string, awards: BadgeAward[]) {
  const db = getDb();
  for (const a of awards) {
    try {
      await db.insert(schema.userBadges).values({
        userId,
        badgeId: a.badgeId,
        seasonType: a.seasonType,
        weekNumber: a.weekNumber ?? SEASON_BADGE_WEEK,
      });
    } catch {
      /* already awarded, or table missing until db:push */
    }
  }
}

/**
 * Hard-delete cumulative badge rows via raw SQL (neon-http), then verify wipe.
 * Drizzle delete alone has been unreliable for this path in production.
 */
async function wipeLifetimeThresholdBadgeRows(): Promise<{ before: number; after: number }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const sql = neon(url);

  const beforeRows = await sql`
    SELECT count(*)::int AS n
    FROM user_badges
    WHERE badge_id IN ('by_a_nose', 'juice_box', 'road_dog')
  `;
  const before = Number(beforeRows[0]?.n ?? 0);

  await sql`
    DELETE FROM user_badges
    WHERE badge_id IN ('by_a_nose', 'juice_box', 'road_dog')
  `;

  const afterRows = await sql`
    SELECT count(*)::int AS n
    FROM user_badges
    WHERE badge_id IN ('by_a_nose', 'juice_box', 'road_dog')
  `;
  const after = Number(afterRows[0]?.n ?? 0);
  if (after !== 0) {
    throw new Error(`Failed to wipe cumulative badges (still ${after} row(s) left)`);
  }
  return { before, after };
}

/** Delete every user_badges row, then verify the table is empty. */
async function wipeAllBadgeRows(): Promise<{ before: number; after: number }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const sql = neon(url);

  const beforeRows = await sql`SELECT count(*)::int AS n FROM user_badges`;
  const before = Number(beforeRows[0]?.n ?? 0);

  await sql`DELETE FROM user_badges`;

  const afterRows = await sql`SELECT count(*)::int AS n FROM user_badges`;
  const after = Number(afterRows[0]?.n ?? 0);
  if (after !== 0) {
    throw new Error(`Failed to wipe all badges (still ${after} row(s) left)`);
  }
  return { before, after };
}

/**
 * Drop every grant of cumulative badges, then re-award from career totals
 * across all fully final weeks in the active season.
 */
export async function reconcileLifetimeThresholdBadges(): Promise<{
  removed: number;
  granted: number;
  countsByUser: number;
  remainingAfterWipe: number;
}> {
  const wipe = await wipeLifetimeThresholdBadgeRows();
  const db = getDb();

  const users = await db.select().from(schema.users).where(eq(schema.users.isBanned, false));
  const allGameRows = await getActiveSeasonGameRows();
  const seen = new Set<string>();
  const completed: Array<{ seasonType: number; week: number; games: GameData[] }> = [];
  const gameCache = new Map<string, GameData[]>();

  for (const r of allGameRows) {
    const key = `${r.week.seasonType}-${r.week.weekNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let games = gameCache.get(key);
    if (!games) {
      games = await getGamesForWeek(r.week.seasonType, r.week.weekNumber);
      gameCache.set(key, games);
    }
    if (!isWeekFullyComplete(games) || !games.some((g) => isGradedForStandings(g))) continue;
    completed.push({ seasonType: r.week.seasonType, week: r.week.weekNumber, games });
  }
  completed.sort((a, b) => a.seasonType - b.seasonType || a.week - b.week);

  let granted = 0;
  for (const u of users) {
    const lifetime: LifetimeBadgeCounts = { by_a_nose: 0, juice_box: 0, road_dog: 0 };
    for (const slate of completed) {
      const rows = allGameRows.filter(
        (r) => r.week.seasonType === slate.seasonType && r.week.weekNumber === slate.week,
      );
      const picks = await loadUserPicksMap(u.id, rows);
      const ev = countLifetimeBadgeEvents(slate.games, picks);
      lifetime.by_a_nose += ev.by_a_nose;
      lifetime.juice_box += ev.juice_box;
      lifetime.road_dog += ev.road_dog;
    }

    const awards: BadgeAward[] = [];
    const seasonType = completed[completed.length - 1]?.seasonType ?? 2;
    if (lifetime.by_a_nose >= LIFETIME_BADGE_THRESHOLDS.by_a_nose) {
      awards.push({ badgeId: "by_a_nose", seasonType, weekNumber: SEASON_BADGE_WEEK });
    }
    if (lifetime.juice_box >= LIFETIME_BADGE_THRESHOLDS.juice_box) {
      awards.push({ badgeId: "juice_box", seasonType, weekNumber: SEASON_BADGE_WEEK });
    }
    if (lifetime.road_dog >= LIFETIME_BADGE_THRESHOLDS.road_dog) {
      awards.push({ badgeId: "road_dog", seasonType, weekNumber: SEASON_BADGE_WEEK });
    }
    if (awards.length > 0) {
      await insertAwards(u.id, awards);
      granted += awards.length;
    }
  }

  return {
    removed: wipe.before,
    granted,
    countsByUser: users.length,
    remainingAfterWipe: wipe.after,
  };
}

/**
 * Award badges for a week only after the full slate is final.
 * Week-dependent badges (clean sweep, streaks, ranks, etc.) must not fire mid-week.
 */
export async function awardBadgesForWeek(
  seasonType: number,
  weekNumber: number,
  opts?: { skipLifetimeReconcile?: boolean },
): Promise<{
  awarded: number;
  skipped?: "empty" | "incomplete";
  lifetime?: { removed: number; granted: number; countsByUser: number };
}> {
  const games = await getGamesForWeek(seasonType, weekNumber);
  if (games.length === 0) {
    return { awarded: 0, skipped: "empty" };
  }
  if (!isWeekFullyComplete(games) || !games.some((g) => isGradedForStandings(g))) {
    return { awarded: 0, skipped: "incomplete" };
  }

  const db = getDb();
  const users = await db.select().from(schema.users).where(eq(schema.users.isBanned, false));
  const allGameRows = await getActiveSeasonGameRows();
  const weekRows = allGameRows.filter(
    (r) => r.week.seasonType === seasonType && r.week.weekNumber === weekNumber,
  );

  const players: WeekComparePlayer[] = [];
  const pickMaps = new Map<string, Record<string, UserPick>>();

  for (const u of users) {
    const picks = await loadUserPicksMap(u.id, weekRows);
    pickMaps.set(u.id, picks);
    const comparePicks: WeekComparePlayer["picks"] = {};
    for (const [id, p] of Object.entries(picks)) {
      if (p.pick) comparePicks[id] = { pick: p.pick, isConfidenceBet: p.isConfidenceBet };
    }
    players.push({
      userId: u.id,
      username: u.username,
      displayName: u.displayName ?? u.username,
      picks: comparePicks,
    });
  }

  const atsSorted = [...users]
    .map((u) => ({
      id: u.id,
      ...weekAtsRecord(games, pickMaps.get(u.id) ?? {}),
      pl: confidencePlForWeek(games, pickMaps.get(u.id) ?? {}).pl,
    }))
    .filter((r) => r.total > 0 || r.pl !== 0)
    .sort((a, b) => b.winPct - a.winPct || b.pl - a.pl);

  const plSorted = [...atsSorted].sort((a, b) => b.pl - a.pl || b.winPct - a.winPct);
  const atsRank = new Map(atsSorted.map((r, i) => [r.id, i]));
  const plRank = new Map(plSorted.map((r, i) => [r.id, i]));

  const priorWeek = weekNumber > 1 ? weekNumber - 1 : null;
  let priorAtsRank: Map<string, number> | null = null;
  let priorPlRank: Map<string, number> | null = null;
  let priorCount: number | null = null;
  const gameCache = new Map<number, GameData[]>();
  gameCache.set(weekNumber, games);

  if (priorWeek != null) {
    const priorGames = await getGamesForWeek(seasonType, priorWeek);
    gameCache.set(priorWeek, priorGames);
    if (priorGames.some((g) => isGradedForStandings(g))) {
      const priorRows = allGameRows.filter(
        (r) => r.week.seasonType === seasonType && r.week.weekNumber === priorWeek,
      );
      const priorStats = [];
      for (const u of users) {
        const picks = await loadUserPicksMap(u.id, priorRows);
        priorStats.push({
          id: u.id,
          ...weekAtsRecord(priorGames, picks),
          pl: confidencePlForWeek(priorGames, picks).pl,
        });
      }
      const pAts = priorStats
        .filter((r) => r.total > 0 || r.pl !== 0)
        .sort((a, b) => b.winPct - a.winPct || b.pl - a.pl);
      const pPl = [...pAts].sort((a, b) => b.pl - a.pl || b.winPct - a.winPct);
      priorAtsRank = new Map(pAts.map((r, i) => [r.id, i]));
      priorPlRank = new Map(pPl.map((r, i) => [r.id, i]));
      priorCount = pAts.length;
    }
  }

  const seasonWeeks = [
    ...new Set(
      allGameRows
        .filter((r) => r.week.seasonType === seasonType)
        .map((r) => r.week.weekNumber),
    ),
  ].sort((a, b) => a - b);

  let awarded = 0;
  for (const u of users) {
    const picks = pickMaps.get(u.id) ?? {};
    const atsPcts: number[] = [];
    const confPcts: number[] = [];
    for (const w of seasonWeeks) {
      if (w > weekNumber) break;
      let wg = gameCache.get(w);
      if (!wg) {
        wg = await getGamesForWeek(seasonType, w);
        gameCache.set(w, wg);
      }
      const wr = allGameRows.filter((r) => r.week.seasonType === seasonType && r.week.weekNumber === w);
      const wp = w === weekNumber ? picks : await loadUserPicksMap(u.id, wr);
      const rec = weekAtsRecord(wg, wp);
      if (rec.total > 0) atsPcts.push(rec.winPct);
      if (confidencePlForWeek(wg, wp).eligible && wg.some((g) => isGradedForStandings(g))) {
        confPcts.push(weekConfWinPct(wg, wp));
      }
    }

    const awards = evaluateWeekBadges({
      games,
      seasonType,
      weekNumber,
      player: { userId: u.id, username: u.username, picks },
      allPlayers: players,
      atsStreak: streakEndingAt(atsPcts),
      confStreak: streakEndingAt(confPcts),
      weekRankAts: atsRank.get(u.id) ?? atsSorted.length,
      weekRankPl: plRank.get(u.id) ?? plSorted.length,
      playerCount: Math.max(atsSorted.length, 1),
      priorWeekRankAts: priorAtsRank?.get(u.id) ?? null,
      priorWeekRankPl: priorPlRank?.get(u.id) ?? null,
      priorPlayerCount: priorCount,
      alreadyHasHowl: await userHasBadge(u.id, "howl"),
      alreadyHasNoShow: await userHasBadge(u.id, "no_show"),
      alreadyHasWeekChampion: await userHasBadge(u.id, "week_champion"),
      alreadyHasBankrollKing: await userHasBadge(u.id, "bankroll_king"),
    });

    await insertAwards(u.id, awards);
    awarded += awards.length;
  }

  // Overall season leaders → High Roller / Throne Room
  type Agg = { id: string; correct: number; total: number; pl: number };
  const aggs: Agg[] = [];
  for (const u of users) {
    let correct = 0;
    let total = 0;
    let pl = 0;
    for (const w of seasonWeeks) {
      if (w > weekNumber) break;
      let wg = gameCache.get(w);
      if (!wg) {
        wg = await getGamesForWeek(seasonType, w);
        gameCache.set(w, wg);
      }
      const wr = allGameRows.filter((r) => r.week.seasonType === seasonType && r.week.weekNumber === w);
      const picks = await loadUserPicksMap(u.id, wr);
      const rec = weekAtsRecord(wg, picks);
      correct += rec.correct;
      total += rec.total;
      pl += confidencePlForWeek(wg, picks).pl;
    }
    aggs.push({ id: u.id, correct, total, pl });
  }

  const byWin = [...aggs]
    .filter((a) => a.total > 0)
    .sort((a, b) => b.correct / b.total - a.correct / a.total || b.pl - a.pl);
  const byPl = [...aggs].sort(
    (a, b) => b.pl - a.pl || (b.total ? b.correct / b.total : 0) - (a.total ? a.correct / a.total : 0),
  );

  if (byWin[0] && !(await userHasBadge(byWin[0].id, "high_roller"))) {
    await insertAwards(byWin[0].id, [
      { badgeId: "high_roller", seasonType, weekNumber: SEASON_BADGE_WEEK },
    ]);
    awarded++;
  }
  if (byPl[0] && !(await userHasBadge(byPl[0].id, "throne_room"))) {
    await insertAwards(byPl[0].id, [
      { badgeId: "throne_room", seasonType, weekNumber: SEASON_BADGE_WEEK },
    ]);
    awarded++;
  }

  // Cumulative badges are reconciled separately (wipe + re-award from career totals).
  if (opts?.skipLifetimeReconcile) {
    return { awarded };
  }
  const lifetime = await reconcileLifetimeThresholdBadges();
  awarded += lifetime.granted;

  return { awarded, lifetime };
}

export type BadgeRefreshWeekResult = {
  seasonType: number;
  week: number;
  awarded: number;
  status: "ok" | "skipped_empty" | "skipped_incomplete";
};

/**
 * Admin / backfill: award badges for one week, or every completed week in the
 * active season (oldest → newest so season_once "first" badges land correctly).
 * Full backfill (`allCompleted`) wipes every badge row first, then recalculates.
 */
export async function refreshBadges(opts: {
  seasonType?: number;
  week?: number;
  allCompleted?: boolean;
}): Promise<{
  weeks: BadgeRefreshWeekResult[];
  totalAwarded: number;
  wiped?: number;
  lifetime: {
    removed: number;
    granted: number;
    countsByUser: number;
    remainingAfterWipe?: number;
  };
}> {
  const weeks: BadgeRefreshWeekResult[] = [];
  let wiped: number | undefined;

  if (opts.allCompleted) {
    const fullWipe = await wipeAllBadgeRows();
    wiped = fullWipe.before;

    const allGameRows = await getActiveSeasonGameRows();
    const seen = new Set<string>();
    const slate: Array<{ seasonType: number; week: number }> = [];
    for (const r of allGameRows) {
      const key = `${r.week.seasonType}-${r.week.weekNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slate.push({ seasonType: r.week.seasonType, week: r.week.weekNumber });
    }
    slate.sort((a, b) => a.seasonType - b.seasonType || a.week - b.week);

    for (const s of slate) {
      // Skip lifetime reconcile inside each week — run once at the end.
      const result = await awardBadgesForWeek(s.seasonType, s.week, { skipLifetimeReconcile: true });
      weeks.push({
        seasonType: s.seasonType,
        week: s.week,
        awarded: result.awarded,
        status:
          result.skipped === "empty"
            ? "skipped_empty"
            : result.skipped === "incomplete"
              ? "skipped_incomplete"
              : "ok",
      });
    }
  } else {
    const seasonType = opts.seasonType;
    const week = opts.week;
    if (seasonType == null || week == null || !Number.isFinite(seasonType) || !Number.isFinite(week)) {
      throw new Error("seasonType and week are required (or pass allCompleted: true)");
    }
    const result = await awardBadgesForWeek(seasonType, week, { skipLifetimeReconcile: true });
    weeks.push({
      seasonType,
      week,
      awarded: result.awarded,
      status:
        result.skipped === "empty"
          ? "skipped_empty"
          : result.skipped === "incomplete"
            ? "skipped_incomplete"
            : "ok",
    });
  }

  const lifetime = await reconcileLifetimeThresholdBadges();

  return {
    weeks,
    totalAwarded: weeks.reduce((sum, w) => sum + w.awarded, 0) + lifetime.granted,
    wiped,
    lifetime,
  };
}

export async function badgesForUser(userId: string) {
  try {
    const db = getDb();
    return await db.select().from(schema.userBadges).where(eq(schema.userBadges.userId, userId));
  } catch {
    return [];
  }
}

/** All badge rows, or [] if `user_badges` is not migrated yet. */
export async function allBadgeRows() {
  try {
    const db = getDb();
    return await db.select().from(schema.userBadges);
  } catch {
    return [];
  }
}
