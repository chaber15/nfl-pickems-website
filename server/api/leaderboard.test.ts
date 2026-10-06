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
    missedStars: 0,
    plStatus: "ranked",
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

test("buildLeaderboardEntries: totals, push, missed ★, ties ordered by name", () => {
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
  assert.equal(c.confidencePl.toFixed(2), "-5.10"); // one losing ★ at -110, four missed
  assert.equal(c.missedStars, 4);
  assert.equal(c.weeksComplete, 0);
  assert.equal(c.plStatus, "ranked");
});

/** `n` final games in a week, all covered by the favorite. */
function weekGames(week: number, n = 5) {
  return Array.from({ length: n }, (_, i) =>
    makeGame(`w${week}g${i}`, { weekNumber: week, kickoffAt: `2026-09-${String(6 + week * 7).padStart(2, "0")}T17:00:00.000Z` }),
  );
}
/** ★ picks on the favorite for the first `stars` games of a week (a win each, +1). */
function starPicks(userId: string, week: number, stars: number): LeaderboardPick[] {
  return Array.from({ length: stars }, (_, i) => ({
    userId,
    gameId: `w${week}g${i}`,
    pick: "favorite" as const,
    isConfidenceBet: true,
  }));
}
const byId = (entries: LeaderboardEntry[]) => new Map(entries.map((e) => [e.userId, e]));
const player = (id: string) => ({ id, username: id, displayName: null });

test("buildLeaderboardEntries: missed ★ cost 1 each, but not before a player's first pick", () => {
  const games = [...weekGames(1), ...weekGames(2)];
  const picks = [
    ...starPicks("full", 1, 5),
    ...starPicks("full", 2, 5),
    ...starPicks("short", 1, 5),
    ...starPicks("short", 2, 3),
    ...starPicks("late", 2, 5),
    // Picked in week 1 without any ★, then skipped week 2
    { userId: "nostar", gameId: "w1g0", pick: "favorite" as const, isConfidenceBet: false },
  ];
  const e = byId(
    buildLeaderboardEntries(["full", "short", "late", "nostar", "never"].map(player), games, picks, { weekly: false }),
  );
  assert.equal(e.get("full")!.confidencePl, 10);
  assert.equal(e.get("short")!.confidencePl, 6); // 5 + (3 − 2 missed)
  assert.equal(e.get("short")!.missedStars, 2);
  assert.equal(e.get("short")!.weeksComplete, 1);
  assert.equal(e.get("late")!.confidencePl, 5); // week 1 was before they joined
  assert.equal(e.get("late")!.missedStars, 0);
  assert.equal(e.get("nostar")!.confidencePl, -10);
  assert.equal(e.get("nostar")!.plStatus, "ranked"); // only 2 closed weeks so far
  assert.equal(e.get("never")!.confidencePl, 0);
  assert.equal(e.get("never")!.plStatus, "off");
});

test("buildLeaderboardEntries: missed ★ aren't charged until the week's last kickoff", () => {
  const games = [
    ...weekGames(1, 4),
    makeGame("mnf", { status: "scheduled", atsResult: null, kickoffAt: "2026-09-15T00:15:00.000Z" }),
  ];
  const picks = starPicks("a", 1, 3);
  const users = [player("a")];
  const before = buildLeaderboardEntries(users, games, picks, { weekly: true, now: new Date("2026-09-14T12:00:00Z") })[0]!;
  assert.equal(before.confidencePl, 3);
  assert.equal(before.missedStars, 0);
  const after = buildLeaderboardEntries(users, games, picks, { weekly: true, now: new Date("2026-09-15T01:00:00Z") })[0]!;
  assert.equal(after.confidencePl, 1);
  assert.equal(after.missedStars, 2);
});

test("buildLeaderboardEntries: weekly board greys out no-★ players and leaves off not-yet-joined ones", () => {
  const picks = [
    ...starPicks("full", 2, 5),
    ...starPicks("partial", 2, 3),
    { userId: "nostar", gameId: "w2g0", pick: "favorite" as const, isConfidenceBet: false },
  ];
  const e = byId(
    buildLeaderboardEntries(["full", "partial", "nostar", "away", "new"].map(player), weekGames(2), picks, {
      weekly: true,
      joinedBefore: new Set(["away"]),
    }),
  );
  assert.deepEqual([e.get("full")!.confidencePl, e.get("full")!.plStatus], [5, "ranked"]);
  assert.deepEqual([e.get("partial")!.confidencePl, e.get("partial")!.missedStars, e.get("partial")!.plStatus], [1, 2, "ranked"]);
  assert.deepEqual([e.get("nostar")!.confidencePl, e.get("nostar")!.plStatus], [-5, "idle"]);
  assert.deepEqual([e.get("away")!.confidencePl, e.get("away")!.plStatus], [-5, "idle"]); // picked in an earlier week
  assert.deepEqual([e.get("new")!.confidencePl, e.get("new")!.plStatus], [0, "off"]);
});

test("buildLeaderboardEntries: no ★ in the last 3 closed weeks = dropout until the next ★", () => {
  const closed = [1, 2, 3, 4].flatMap((w) => weekGames(w));
  const picks = [...starPicks("quit", 1, 5), ...[1, 2, 3, 4].flatMap((w) => starPicks("stay", w, 5))];
  const users = ["quit", "stay"].map(player);
  const e = byId(buildLeaderboardEntries(users, closed, picks, { weekly: false }));
  assert.equal(e.get("stay")!.plStatus, "ranked");
  assert.equal(e.get("quit")!.plStatus, "idle");
  assert.equal(e.get("quit")!.confidencePl, -10); // +5, then −5 × 3 keeps accumulating

  // A ★ in the week that's still open brings them back with the full number
  const open = makeGame("w5g0", { weekNumber: 5, status: "scheduled", atsResult: null, kickoffAt: "2099-01-01T00:00:00.000Z" });
  const back = byId(
    buildLeaderboardEntries(users, [...closed, open], [...picks, { userId: "quit", gameId: "w5g0", pick: "favorite", isConfidenceBet: true }], {
      weekly: false,
    }),
  );
  assert.equal(back.get("quit")!.plStatus, "ranked");
  assert.equal(back.get("quit")!.confidencePl, -10);
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
