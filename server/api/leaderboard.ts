import type { HandlerEvent } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { dbGameToGameData, getActiveSeasonGameRows } from "../espn/sync";
import {
  pickCorrectness,
  unitsDelta,
  computeWinPct,
  isGradedForStandings,
  weekPlEligible,
} from "../../shared/scoring";
import type { GameData, LeaderboardEntry } from "../../shared/types";
import { publicDisplayName } from "../../shared/userDisplay";
import {
  badgeDescription,
  badgeName,
  isDisplayableBadgeAward,
  isSeasonScopedBadge,
} from "../../shared/badges";
import { allBadgeRows } from "../badges";
import { json } from "./http";

export async function computeLeaderboard(filter?: {
  seasonType: number;
  week: number;
}): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const activeUsers = await db.select().from(schema.users).where(eq(schema.users.isBanned, false));

  let allGames = await getActiveSeasonGameRows();

  if (filter) {
    allGames = allGames.filter(
      (r) => r.week.seasonType === filter.seasonType && r.week.weekNumber === filter.week,
    );
  }

  const seasonGameIds = new Set(allGames.map((r) => r.game.id));
  const pickRows = await db
    .select({ pick: schema.picks, game: schema.games, week: schema.weeks })
    .from(schema.picks)
    .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id));
  const allPicks = pickRows.filter((r) => seasonGameIds.has(r.game.id));

  /** userId → gameId → pick row */
  const picksByUser = new Map<string, Map<string, (typeof allPicks)[number]>>();
  for (const row of allPicks) {
    let byGame = picksByUser.get(row.pick.userId);
    if (!byGame) {
      byGame = new Map();
      picksByUser.set(row.pick.userId, byGame);
    }
    byGame.set(row.game.id, row);
  }

  const entries: LeaderboardEntry[] = [];

  for (const u of activeUsers) {
    let correct = 0;
    let total = 0;
    let confCorrect = 0;
    let confTotal = 0;
    let confidencePl = 0;

    // Eligibility uses ALL ★ bets in a week (even before finals).
    // P/L units only sum from finals.
    const weekStats = new Map<
      string,
      { count: number; phase: GameData["phase"]; rawPl: number; confCorrect: number; confGraded: number }
    >();

    const userPicks = picksByUser.get(u.id);

    for (const { game, week } of allGames) {
      const g = dbGameToGameData(game, week);
      const weekKey = week.id;
      const existing = weekStats.get(weekKey) ?? {
        count: 0,
        phase: week.phase as GameData["phase"],
        rawPl: 0,
        confCorrect: 0,
        confGraded: 0,
      };

      const userPick = userPicks?.get(game.id);

      if (userPick?.pick.isConfidenceBet) {
        existing.count++;
        if (
          isGradedForStandings(g) &&
          g.spread != null &&
          g.favoriteSide &&
          g.atsResult
        ) {
          existing.rawPl += unitsDelta(
            userPick.pick.pick,
            g.atsResult,
            g.favoriteSide,
            g.oddsAway,
            g.oddsHome,
          );
        }
        if (isGradedForStandings(g)) {
          existing.confGraded++;
          existing.confCorrect += pickCorrectness(userPick.pick.pick, g.atsResult);
        }
      }
      weekStats.set(weekKey, existing);

      if (!isGradedForStandings(g)) continue;
      total++;
      correct += pickCorrectness(userPick?.pick.pick ?? null, g.atsResult);
    }

    let weeksComplete = 0;
    for (const { count, phase, rawPl, confCorrect: wc, confGraded } of weekStats.values()) {
      // Eligible weeks with activity only (skip empty playoff weeks for inactive users)
      if (weekPlEligible(phase, count) && count > 0) {
        confidencePl += rawPl;
        weeksComplete++;
        confCorrect += wc;
        confTotal += confGraded;
      }
    }

    // Skip users with no graded games in a weekly board (keeps mini board clean)
    if (filter && total === 0 && confidencePl === 0) continue;

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
    });
  }

  entries.sort((a, b) => b.winPct - a.winPct || b.confidencePl - a.confidencePl);

  const badgeRows = await allBadgeRows();
  for (const entry of entries) {
    const forUser = badgeRows.filter(
      (b) => b.userId === entry.userId && isDisplayableBadgeAward(b.badgeId, b.weekNumber),
    );
    const scoped = filter
      ? forUser.filter(
          (b) =>
            b.seasonType === filter.seasonType &&
            (b.weekNumber === filter.week || isSeasonScopedBadge(b.weekNumber)),
        )
      : forUser;
    entry.badges = scoped.map((b) => ({
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
