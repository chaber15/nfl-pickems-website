import type {
  GameData,
  HistoryRow,
  PickSide,
  UserPick,
  UserStats,
  WeeklyStatRow,
} from "./types";
import { abbrevForSide, formatMatchup, formatPick, formatResult } from "./pickDisplay";
import { sortGamesLiveFirstThenChronological } from "./gameOrder";
import {
  computeWinPct,
  countConfidenceBets,
  isGameLocked,
  isGradedForStandings,
  pickCorrectness,
  unitsDelta,
  weekPlEligible,
} from "./scoring";

export function buildHistoryRows(
  games: GameData[],
  picks: Record<string, UserPick>,
  now = new Date(),
): HistoryRow[] {
  return sortGamesLiveFirstThenChronological(games).map((g) => {
      const up = picks[g.id];
      const locked = isGameLocked(g.kickoffAt, now);
      let outcome: HistoryRow["outcome"] = "pending";
      let units = 0;

      if (!up?.pick && locked) {
        outcome = "no_pick";
      } else if (up?.pick && isGradedForStandings(g) && g.atsResult && g.spread != null && g.favoriteSide) {
        const c = pickCorrectness(up.pick, g.atsResult);
        outcome = c === 1 ? "win" : c === 0.5 ? "push" : "loss";
        units = unitsDelta(up.pick, g.atsResult, g.favoriteSide, g.oddsAway, g.oddsHome);
      } else if (up?.pick && (locked || g.status !== "final")) {
        outcome = "pending";
      }

      return {
        gameId: g.id,
        weekNumber: g.weekNumber,
        matchup: formatMatchup(g),
        kickoffAt: g.kickoffAt,
        pickDisplay: up?.pick ? formatPick(g, up.pick) : null,
        pickTeamAbbrev: up?.pick ? abbrevForSide(g, up.pick) : null,
        isConfidenceBet: up?.isConfidenceBet ?? false,
        resultDisplay: formatResult(g),
        outcome,
        unitsDelta: units,
      };
    });
}

/**
 * Confidence P/L for a slate of games in one week.
 * Returns 0 if the week is not P/L-eligible (regular/preseason without exactly 5 ★).
 */
export function confidencePlForWeek(
  games: GameData[],
  picks: Record<string, UserPick>,
): { pl: number; confCount: number; eligible: boolean } {
  const phase = games[0]?.phase ?? "regular";
  const confCount = countConfidenceBets(picks);
  const eligible = weekPlEligible(phase, confCount);
  if (!eligible) return { pl: 0, confCount, eligible: false };

  let pl = 0;
  for (const g of games) {
    if (!isGradedForStandings(g)) continue;
    const up = picks[g.id];
    if (!up?.pick || !up.isConfidenceBet) continue;
    if (g.spread == null || !g.favoriteSide || !g.atsResult) continue;
    pl += unitsDelta(up.pick, g.atsResult, g.favoriteSide, g.oddsAway, g.oddsHome);
  }
  return { pl, confCount, eligible: true };
}

function streakFromWeekWinPcts(weekWinPctsNewestFirst: number[]): number {
  let streak = 0;
  for (const pct of weekWinPctsNewestFirst) {
    if (pct > 50) streak++;
    else break;
  }
  return streak;
}

/** Weekly row plus its season type (2 = regular, 3 = playoffs) so playoff weeks sort last. */
export type WeeklyStatRowWithSeason = WeeklyStatRow & { seasonType: number };

type WeekRef = { week: number; pl: number; seasonType: number };

/** `UserStats` with additive `seasonType` fields on weekly rows and best/worst weeks. */
export type ComputedUserStats = Omit<
  UserStats,
  "weeklyRows" | "bestWeekConfidence" | "worstWeekConfidence"
> & {
  weeklyRows: WeeklyStatRowWithSeason[];
  bestWeekConfidence: WeekRef | null;
  worstWeekConfidence: WeekRef | null;
};

/** Chronological week order: (seasonType, week) so playoffs follow the regular season. */
export function compareSeasonWeeks(
  a: { seasonType: number; weekNumber: number },
  b: { seasonType: number; weekNumber: number },
): number {
  return a.seasonType - b.seasonType || a.weekNumber - b.weekNumber;
}

export function computeUserStats(
  games: GameData[],
  picks: Record<string, UserPick>,
  _now = new Date(),
): ComputedUserStats {
  let correctAll = 0;
  let totalAll = 0;
  let correctConf = 0;
  let totalConf = 0;
  let confidencePl = 0;
  let hypotheticalPl = 0;
  let favPicks = 0;
  let dogPicks = 0;
  let favHits = 0;
  let dogHits = 0;
  let favoriteUnits = 0;
  let underdogUnits = 0;

  const weekBuckets = new Map<
    string,
    {
      weekNumber: number;
      seasonType: number;
      phase: GameData["phase"];
      picksMade: number;
      totalGames: number;
      confidenceBets: number;
      correct: number;
      confidencePlRaw: number;
      hypotheticalPl: number;
    }
  >();

  const sorted = [...games].sort(
    (a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime(),
  );

  // Count ★ bets for eligibility across ALL games (including not-yet-final)
  const weekConfTotals = new Map<string, number>();
  for (const g of games) {
    const key = `${g.seasonType}-${g.weekNumber}`;
    const up = picks[g.id];
    if (up?.isConfidenceBet) {
      weekConfTotals.set(key, (weekConfTotals.get(key) ?? 0) + 1);
    }
  }

  for (const g of sorted) {
    if (!isGradedForStandings(g)) continue;

    const key = `${g.seasonType}-${g.weekNumber}`;
    if (!weekBuckets.has(key)) {
      weekBuckets.set(key, {
        weekNumber: g.weekNumber,
        seasonType: g.seasonType,
        phase: g.phase,
        picksMade: 0,
        totalGames: 0,
        confidenceBets: weekConfTotals.get(key) ?? 0,
        correct: 0,
        confidencePlRaw: 0,
        hypotheticalPl: 0,
      });
    }
    const bucket = weekBuckets.get(key)!;
    bucket.totalGames++;
    // Keep full-week ★ count for eligibility (don't re-increment from graded-only)
    bucket.confidenceBets = weekConfTotals.get(key) ?? 0;
    totalAll++;

    const up = picks[g.id];
    if (!up?.pick) {
      hypotheticalPl -= 1;
      bucket.hypotheticalPl -= 1;
      continue;
    }

    bucket.picksMade++;
    const c = pickCorrectness(up.pick, g.atsResult);
    correctAll += c;
    bucket.correct += c;

    if (up.pick === "favorite") {
      favPicks++;
      if (c === 1) favHits++;
    } else {
      dogPicks++;
      if (c === 1) dogHits++;
    }

    if (g.spread != null && g.favoriteSide && g.atsResult) {
      const delta = unitsDelta(up.pick, g.atsResult, g.favoriteSide, g.oddsAway, g.oddsHome);
      hypotheticalPl += delta;
      bucket.hypotheticalPl += delta;
      if (up.isConfidenceBet) {
        bucket.confidencePlRaw += delta;
      }
      if (up.pick === "favorite") favoriteUnits += delta;
      else underdogUnits += delta;
    }
  }

  const weeklyRows: WeeklyStatRowWithSeason[] = Array.from(weekBuckets.values())
    .map((b) => {
      const eligible = weekPlEligible(b.phase, b.confidenceBets);
      const weekConfPl = eligible ? b.confidencePlRaw : 0;
      if (eligible) confidencePl += b.confidencePlRaw;
      const row: WeeklyStatRowWithSeason = {
        weekNumber: b.weekNumber,
        seasonType: b.seasonType,
        phase: b.phase,
        picksMade: b.picksMade,
        totalGames: b.totalGames,
        confidenceBets: b.confidenceBets,
        winPct: computeWinPct(b.correct, b.totalGames),
        confidencePl: weekConfPl,
        hypotheticalPl: b.hypotheticalPl,
        plEligible: eligible,
      };
      return row;
    })
    .sort(compareSeasonWeeks);

  // Recalculate confidencePl from weekly rows (already accumulated above correctly)
  confidencePl = weeklyRows.reduce((sum, r) => sum + r.confidencePl, 0);

  // Confidence win %: only count ★ bets from eligible weeks
  let correctConfEligible = 0;
  let totalConfEligible = 0;
  const confWeekPctByKey = new Map<
    string,
    { correct: number; total: number; weekNumber: number; seasonType: number }
  >();

  for (const g of sorted) {
    if (!isGradedForStandings(g)) continue;
    const up = picks[g.id];
    if (!up?.pick || !up.isConfidenceBet) continue;
    const key = `${g.seasonType}-${g.weekNumber}`;
    const bucket = weekBuckets.get(key);
    if (!bucket || !weekPlEligible(bucket.phase, bucket.confidenceBets)) continue;

    const c = pickCorrectness(up.pick, g.atsResult);
    totalConfEligible++;
    correctConfEligible += c;
    const confWeek = confWeekPctByKey.get(key) ?? {
      correct: 0,
      total: 0,
      weekNumber: g.weekNumber,
      seasonType: g.seasonType,
    };
    confWeek.correct += c;
    confWeek.total++;
    confWeekPctByKey.set(key, confWeek);
  }

  if (weekBuckets.size > 0) {
    correctConf = correctConfEligible;
    totalConf = totalConfEligible;
  }

  let bestWeekConfidence: WeekRef | null = null;
  let worstWeekConfidence: WeekRef | null = null;
  for (const row of weeklyRows) {
    if (!row.plEligible) continue;
    const ref = { week: row.weekNumber, pl: row.confidencePl, seasonType: row.seasonType };
    if (!bestWeekConfidence || row.confidencePl > bestWeekConfidence.pl) bestWeekConfidence = ref;
    if (!worstWeekConfidence || row.confidencePl < worstWeekConfidence.pl) worstWeekConfidence = ref;
  }

  const pickedCount = favPicks + dogPicks;

  // Newest first = reverse chronological (seasonType, week), so playoff weeks are newest.
  const weekPctNewestFirst = weeklyRows
    .filter((r) => r.totalGames > 0)
    .reverse()
    .map((r) => r.winPct);

  const confWeekPctNewestFirst = [...confWeekPctByKey.values()]
    .filter((w) => w.total > 0)
    .sort((a, b) => compareSeasonWeeks(b, a))
    .map((w) => computeWinPct(w.correct, w.total));

  return {
    winPctAll: computeWinPct(correctAll, totalAll),
    winPctConfidence: computeWinPct(correctConf, totalConf),
    confidencePl,
    hypotheticalPl,
    confidenceRoi: totalConf > 0 ? (confidencePl / totalConf) * 100 : 0,
    hypotheticalRoi: totalAll > 0 ? (hypotheticalPl / totalAll) * 100 : 0,
    bestWeekConfidence,
    worstWeekConfidence,
    favoritePickRate: pickedCount > 0 ? (favPicks / pickedCount) * 100 : 0,
    underdogPickRate: pickedCount > 0 ? (dogPicks / pickedCount) * 100 : 0,
    favoriteHitRate: favPicks > 0 ? (favHits / favPicks) * 100 : 0,
    underdogHitRate: dogPicks > 0 ? (dogHits / dogPicks) * 100 : 0,
    favoriteUnits,
    underdogUnits,
    currentStreakAll: streakFromWeekWinPcts(weekPctNewestFirst),
    currentStreakConfidence: streakFromWeekWinPcts(confWeekPctNewestFirst),
    weeklyRows,
  };
}

export function toUserPickMap(
  picks: Record<string, { pick: string; isConfidenceBet: boolean }>,
): Record<string, UserPick> {
  const mapped: Record<string, UserPick> = {};
  for (const [id, p] of Object.entries(picks)) {
    mapped[id] = {
      gameId: id,
      pick: p.pick as PickSide,
      isConfidenceBet: p.isConfidenceBet,
    };
  }
  return mapped;
}
