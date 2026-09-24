import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeaderboardEntries, compareLeaderboardEntries, type LeaderboardPick } from "./leaderboard";
import { isGradedForStandings } from "../../shared/scoring";
import { makeGame } from "../../shared/testFixtures";
import type { LeaderboardEntry } from "../../shared/types";

const noLineFinalsUngraded = !isGradedForStandings({ status: "final", atsResult: null });

function entry(p: Partial<LeaderboardEntry> & { userId: string; displayName: string }): LeaderboardEntry {
  return {
    username: p.displayName,
    winPct: 0,
    correct: 0,
    total: 0,
    confCorrect: 0,
    confTotal: 0,
    confidencePl: 0,
    weeksComplete: 0,
    ...p,
  };
}

test("compareLeaderboardEntries: win %, then ★ P/L, then correct, then name, then id", () => {
  const rows = [
    entry({ userId: "u5", displayName: "zed", winPct: 50, confidencePl: 1 }),
    entry({ userId: "u4", displayName: "Amy", winPct: 50, confidencePl: 1 }),
    entry({ userId: "u3", displayName: "bob", winPct: 50, confidencePl: 2 }),
    entry({ userId: "u2", displayName: "amy", winPct: 50, confidencePl: 1.0000000000000002 }),
    entry({ userId: "u1", displayName: "Top", winPct: 60, confidencePl: -3 }),
  ];
  const order = [...rows].sort(compareLeaderboardEntries).map((e) => e.userId);
  // u2/u4 share "amy" case-insensitively and P/L within float noise → userId decides
  assert.deepEqual(order, ["u1", "u3", "u2", "u4", "u5"]);
  // Deterministic regardless of input order
  assert.deepEqual([...rows].reverse().sort(compareLeaderboardEntries).map((e) => e.userId), order);
});

test("buildLeaderboardEntries: totals, push, ★ eligibility, ties ordered by name", () => {
  const ids = ["g1", "g2", "g3", "g4", "g5", "g6"];
  const games = [
    ...ids.map((id) => makeGame(id, { atsResult: id === "g6" ? "push" : "favorite" })),
    makeGame("live", { status: "in_progress", atsResult: null }),
  ];
  const users = [
    { id: "b", username: "b", displayName: "Bea" },
    { id: "a", username: "a", displayName: "Al" },
    { id: "c", username: "c", displayName: null },
  ];
  const picks: LeaderboardPick[] = [];
  for (const u of ["a", "b"]) {
    ids.forEach((gameId, i) => picks.push({ userId: u, gameId, pick: "favorite", isConfidenceBet: i < 5 }));
  }
  picks.push({ userId: "c", gameId: "g1", pick: "underdog", isConfidenceBet: true });
  picks.push({ userId: "c", gameId: "live", pick: "favorite", isConfidenceBet: false });

  const entries = buildLeaderboardEntries(users, games, picks, { weekly: false });
  assert.deepEqual(entries.map((e) => e.userId), ["a", "b", "c"]); // a/b fully tied → "Al" < "Bea"
  const a = entries[0]!;
  assert.equal(a.total, 6); // in-progress game excluded
  assert.equal(a.correct, 5.5); // 5 covers + push
  assert.equal(a.confidencePl, 5); // five ★ wins at -110 → +1 each
  assert.equal(a.weeksComplete, 1);
  assert.deepEqual([a.confCorrect, a.confTotal], [5, 5]);
  const c = entries[2]!;
  assert.equal(c.displayName, "c");
  assert.equal(c.confidencePl, 0); // one ★ → week not eligible
  assert.equal(c.weeksComplete, 0);
});

test(
  "buildLeaderboardEntries: a final game without a line doesn't count",
  { skip: noLineFinalsUngraded ? false : "needs isGradedForStandings to require atsResult (Agent A)" },
  () => {
    const games = [
      makeGame("g1", { atsResult: "favorite" }),
      makeGame("nl", { atsResult: null, spread: null, favoriteSide: null }),
    ];
    const entries = buildLeaderboardEntries(
      [{ id: "a", username: "a", displayName: null }],
      games,
      [{ userId: "a", gameId: "g1", pick: "favorite", isConfidenceBet: false }],
      { weekly: false },
    );
    assert.equal(entries[0]!.total, 1);
    assert.equal(entries[0]!.winPct, 100);
  },
);
