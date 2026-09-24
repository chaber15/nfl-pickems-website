import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHistoryRows, computeUserStats } from "./statsCompute";
import { isGradedForStandings } from "./scoring";
import { makeGame, picksOf } from "./testFixtures";

const noLineFinalsUngraded = !isGradedForStandings({ status: "final", atsResult: null });

test("computeUserStats: weekly rows sort by (seasonType, week); playoffs after week 18", () => {
  // Deliberately shuffled input
  const games = [
    makeGame("po1", { seasonType: 3, weekNumber: 1, phase: "wildcard", kickoffAt: "2027-01-10T18:00:00Z" }),
    makeGame("r17", { seasonType: 2, weekNumber: 17, kickoffAt: "2026-12-27T18:00:00Z" }),
    makeGame("r18", { seasonType: 2, weekNumber: 18, kickoffAt: "2027-01-03T18:00:00Z" }),
  ];
  const picks = picksOf({
    r17: "underdog", // loss
    r18: "favorite", // win
    po1: ["favorite", true], // playoff win with ★ (playoffs are always P/L eligible)
  });
  const stats = computeUserStats(games, picks);
  assert.deepEqual(
    stats.weeklyRows.map((r) => [r.seasonType, r.weekNumber]),
    [
      [2, 17],
      [2, 18],
      [3, 1],
    ],
  );
  // Newest two weeks (reg 18, playoff 1) are wins; reg 17 loss ends the streak.
  // (Sorting by week number alone would have put playoff week 1 last → streak 1.)
  assert.equal(stats.currentStreakAll, 2);
  assert.equal(stats.currentStreakConfidence, 1);
  assert.deepEqual(stats.bestWeekConfidence, { week: 1, pl: 1, seasonType: 3 });
});

test("computeUserStats: push counts half; missing pick counts as a loss", () => {
  const games = [
    makeGame("a", { atsResult: "favorite" }),
    makeGame("b", { atsResult: "push" }),
    makeGame("c", { atsResult: "underdog" }),
  ];
  const stats = computeUserStats(games, picksOf({ a: "favorite", b: "underdog" }));
  assert.equal(stats.winPctAll, 50); // (1 + 0.5 + 0) / 3
  assert.equal(stats.weeklyRows[0]!.picksMade, 2);
  assert.equal(stats.weeklyRows[0]!.totalGames, 3);
});

test(
  "computeUserStats / history: a final game without a line doesn't count",
  { skip: noLineFinalsUngraded ? false : "needs isGradedForStandings to require atsResult (Agent A)" },
  () => {
    const games = [
      makeGame("a", { atsResult: "favorite" }),
      makeGame("nl", { atsResult: null, spread: null, favoriteSide: null }),
    ];
    const stats = computeUserStats(games, picksOf({ a: "favorite" }));
    assert.equal(stats.winPctAll, 100);
    assert.equal(stats.weeklyRows[0]!.totalGames, 1);
    const hist = buildHistoryRows(games, picksOf({ a: "favorite" }), new Date("2026-10-01T00:00:00Z"));
    assert.equal(hist.find((h) => h.gameId === "a")!.outcome, "win");
  },
);
