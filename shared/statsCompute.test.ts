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

test("computeUserStats: each missed ★ costs 1 unit once the week is closed, from the first week with a pick", () => {
  const week = (w: number, n: number, extra: Partial<Parameters<typeof makeGame>[1]> = {}) =>
    Array.from({ length: n }, (_, i) => makeGame(`w${w}g${i}`, { weekNumber: w, ...extra }));
  const games = [
    ...week(1, 5),
    ...week(2, 5),
    ...week(3, 5),
    // Week 4 is still open: one final, one not kicked off yet
    makeGame("w4g0", { weekNumber: 4 }),
    makeGame("w4g1", { weekNumber: 4, status: "scheduled", atsResult: null, kickoffAt: "2026-10-06T00:15:00.000Z" }),
  ];
  const picks = picksOf({
    // Nothing in week 1 (not joined yet); 3 winning ★ in week 2; no picks in week 3; 1 winning ★ in week 4
    w2g0: ["favorite", true],
    w2g1: ["favorite", true],
    w2g2: ["favorite", true],
    w4g0: ["favorite", true],
  });
  const stats = computeUserStats(games, picks, new Date("2026-10-05T12:00:00Z"));
  const rows = stats.weeklyRows.map((r) => [r.weekNumber, r.plEligible, r.missedStars, r.confidencePl]);
  assert.deepEqual(rows, [
    [1, false, 0, 0],
    [2, true, 2, 1],
    [3, true, 5, -5],
    [4, true, 0, 1],
  ]);
  assert.equal(stats.confidencePl, -3);
  assert.equal(stats.winPctConfidence, 100); // only the ★ actually placed
  assert.equal(stats.confidenceRoi, (-3 / 11) * 100); // 4 ★ placed + 7 missed
  assert.deepEqual(stats.worstWeekConfidence, { week: 3, pl: -5, seasonType: 2 });
});
