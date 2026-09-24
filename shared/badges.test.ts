import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgeRowKey,
  computeDesiredBadges,
  diffBadgeRows,
  tieStandings,
  type DesiredBadgeRow,
  type ExistingBadgeRow,
  type SeasonSlate,
} from "./badges";
import { isGradedForStandings } from "./scoring";
import type { UserPick } from "./types";
import { makeGame, picksOf } from "./testFixtures";

/** Agent A's change: a final game without a line is not graded. */
const noLineFinalsUngraded = !isGradedForStandings({ status: "final", atsResult: null });

const users = ["A", "B", "C", "D"].map((u) => ({ userId: u, username: u }));

function rowsFor(rows: DesiredBadgeRow[], userId: string): string[] {
  return rows
    .filter((r) => r.userId === userId)
    .map((r) => `${r.badgeId}@${r.weekNumber}`)
    .sort();
}

test("tieStandings: co-leaders are all first; an all-way tie has no last", () => {
  const s = tieStandings([
    { userId: "a", score: 75 },
    { userId: "b", score: 75 },
    { userId: "c", score: 50 },
    { userId: "d", score: 50 },
  ]);
  assert.deepEqual(s.get("a"), { first: true, last: false });
  assert.deepEqual(s.get("b"), { first: true, last: false });
  assert.deepEqual(s.get("c"), { first: false, last: true });
  assert.deepEqual(s.get("d"), { first: false, last: true });

  const tied = tieStandings([
    { userId: "a", score: 0.47000000000000003 },
    { userId: "b", score: 0.47 },
  ]);
  assert.deepEqual(tied.get("a"), { first: true, last: false });
  assert.deepEqual(tied.get("b"), { first: true, last: false });
});

test("computeDesiredBadges: tie for first → co-champions; push; no-pick user gets nothing", () => {
  const games = [
    makeGame("g1", { atsResult: "favorite" }),
    makeGame("g2", { atsResult: "underdog", homeScore: 20, awayScore: 19 }),
    makeGame("g3", { atsResult: "push", homeScore: 20, awayScore: 17 }),
    makeGame("g4", { atsResult: "favorite" }),
  ];
  const picksByUser = new Map<string, Record<string, UserPick>>([
    // 3 wins + push = 87.5%
    ["A", picksOf({ g1: "favorite", g2: "underdog", g3: "favorite", g4: "favorite" })],
    // same 87.5% (push on the other side)
    ["B", picksOf({ g1: "favorite", g2: "underdog", g3: "underdog", g4: "favorite" })],
    // 0 of 3 picked, skipped g3
    ["C", picksOf({ g1: "underdog", g2: "favorite", g4: "underdog" })],
    // D: no picks at all
  ]);
  const { rows, completedWeeks } = computeDesiredBadges({
    users,
    slates: [{ seasonType: 2, weekNumber: 1, games }],
    picksByUser,
  });
  assert.deepEqual(completedWeeks, [{ seasonType: 2, weekNumber: 1 }]);

  // Co-champions and co-leaders overall; push blocks Clean Sweep; nobody P/L eligible → no Bankroll King
  assert.deepEqual(rowsFor(rows, "A"), ["high_roller@0", "unstarred@1", "week_champion@0"]);
  assert.deepEqual(rowsFor(rows, "B"), ["high_roller@0", "unstarred@1", "week_champion@0"]);
  assert.deepEqual(rowsFor(rows, "C"), ["no_show@0", "total_wipeout@1", "unstarred@1"]);
  // Sat the week out: no Total Wipeout, not ranked
  assert.deepEqual(rowsFor(rows, "D"), []);
  assert.ok(!rows.some((r) => r.badgeId === "bankroll_king"));
});

test("computeDesiredBadges: incomplete week is never evaluated (no transient leaders)", () => {
  const slates: SeasonSlate[] = [
    { seasonType: 2, weekNumber: 1, games: [makeGame("w1", { atsResult: "favorite" })] },
    {
      seasonType: 2,
      weekNumber: 2,
      games: [
        makeGame("w2a", { weekNumber: 2, atsResult: "underdog" }),
        makeGame("w2b", { weekNumber: 2, atsResult: "underdog" }),
      ],
    },
    {
      seasonType: 2,
      weekNumber: 3,
      games: [
        makeGame("w3a", { weekNumber: 3, atsResult: "underdog" }),
        makeGame("w3b", { weekNumber: 3, status: "in_progress", atsResult: null }),
      ],
    },
  ];
  const picksByUser = new Map<string, Record<string, UserPick>>([
    ["A", picksOf({ w1: "favorite", w2a: "favorite", w2b: "favorite", w3a: "favorite" })],
    ["B", picksOf({ w1: "underdog", w2a: "underdog", w2b: "underdog", w3a: "underdog" })],
  ]);
  const { rows, completedWeeks } = computeDesiredBadges({
    users: users.slice(0, 2),
    slates,
    picksByUser,
  });
  assert.deepEqual(completedWeeks.map((w) => w.weekNumber), [1, 2]);
  assert.ok(!rows.some((r) => r.weekNumber === 3), "week 3 is in progress");

  // Week 1: A first, B last. Week 2: B first, A last.
  assert.deepEqual(rowsFor(rows, "A"), [
    "chalk_city@1",
    "chalk_city@2",
    "clean_sweep@1",
    "fall_from_grace_ats@2",
    "high_roller@0",
    "howl@0",
    "lone_wolf@1",
    "total_wipeout@2",
    "unstarred@1",
    "unstarred@2",
    "week_champion@0",
  ]);
  // Through week 2 B (2/3) passes A (1/3) overall → High Roller from week 2 standings
  assert.deepEqual(rowsFor(rows, "B"), [
    "clean_sweep@2",
    "contrarian@2",
    "dog_day_afternoon@1",
    "dog_day_afternoon@2",
    "from_the_dead_ats@2",
    "high_roller@0",
    "howl@0",
    "kennel_club@2",
    "lone_wolf@2",
    "total_wipeout@1",
    "unstarred@1",
    "unstarred@2",
    "week_champion@0",
  ]);
  const hr = rows.find((r) => r.userId === "B" && r.badgeId === "high_roller")!;
  assert.deepEqual(hr.source, { seasonType: 2, weekNumber: 2 });
});

test("computeDesiredBadges: ★ P/L board ranks only eligible players; ties share Bankroll King", () => {
  const ids = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const games = ids.map((id) => makeGame(id, { atsResult: "favorite" }));
  const five = (side: "favorite" | "underdog") =>
    picksOf(Object.fromEntries(ids.map((id, i) => [id, [side, i < 5]])) as never);
  const picksByUser = new Map<string, Record<string, UserPick>>([
    ["A", five("favorite")],
    ["B", five("favorite")],
    // Only one ★ → ineligible (0.00 P/L must not rank)
    ["C", picksOf({ p1: ["underdog", true], p2: "underdog" })],
    ["D", five("underdog")],
  ]);
  const { rows } = computeDesiredBadges({
    users,
    slates: [{ seasonType: 2, weekNumber: 1, games }],
    picksByUser,
  });
  const kings = rows.filter((r) => r.badgeId === "bankroll_king").map((r) => r.userId).sort();
  assert.deepEqual(kings, ["A", "B"]);
  const throne = rows.filter((r) => r.badgeId === "throne_room").map((r) => r.userId).sort();
  assert.deepEqual(throne, ["A", "B"]);
  assert.ok(rows.some((r) => r.userId === "A" && r.badgeId === "five_star_general"));
  assert.ok(rows.some((r) => r.userId === "D" && r.badgeId === "busted_five"));
});

test(
  "computeDesiredBadges: a final game without a line is ignored",
  { skip: noLineFinalsUngraded ? false : "needs isGradedForStandings to require atsResult (Agent A)" },
  () => {
    const games = [
      makeGame("x1", { atsResult: "favorite" }),
      makeGame("x2", { atsResult: null, spread: null, favoriteSide: null }),
    ];
    const { rows } = computeDesiredBadges({
      users: users.slice(0, 1),
      slates: [{ seasonType: 2, weekNumber: 1, games }],
      picksByUser: new Map([["A", picksOf({ x1: "favorite" })]]),
    });
    // Missing the ungraded game is neither a miss (no_show) nor a loss (clean sweep stands)
    assert.ok(rows.some((r) => r.badgeId === "clean_sweep"));
    assert.ok(!rows.some((r) => r.badgeId === "no_show"));
  },
);

test("computeDesiredBadges: a slate whose only finals are ungraded is not evaluated", () => {
  const games = [makeGame("u1", { status: "in_progress", atsResult: null })];
  const { rows, completedWeeks } = computeDesiredBadges({
    users,
    slates: [{ seasonType: 2, weekNumber: 1, games }],
    picksByUser: new Map([["A", picksOf({ u1: "favorite" })]]),
  });
  assert.equal(completedWeeks.length, 0);
  assert.equal(rows.length, 0);
});

// ── diff ────────────────────────────────────────────────────────────────────

const seasonStart = new Date("2026-09-01T00:00:00Z");
const scope = {
  userIds: new Set(["A", "B"]),
  weekKeys: new Set(["2-1", "2-2"]),
  seasonStartedAt: seasonStart,
};

function existing(
  id: string,
  userId: string,
  badgeId: string,
  seasonType: number | null,
  weekNumber: number,
  earnedAt = "2026-09-16T03:00:00Z",
): ExistingBadgeRow {
  return { id, userId, badgeId, seasonType, weekNumber, earnedAt: new Date(earnedAt) };
}

function want(userId: string, badgeId: string, seasonType: number, weekNumber: number): DesiredBadgeRow {
  return { userId, badgeId, seasonType, weekNumber, source: { seasonType, weekNumber: weekNumber || 1 } };
}

test("diffBadgeRows: insert missing, delete stale, keep matches with earnedAt untouched", () => {
  const rows = [
    existing("keep1", "A", "lone_wolf", 2, 1, "2026-09-16T03:54:21.959Z"),
    existing("keep2", "A", "howl", 2, 0, "2026-09-16T03:54:22.005Z"),
    existing("stale", "B", "total_wipeout", 2, 2),
  ];
  const desired = [
    want("A", "lone_wolf", 2, 1),
    // season_once key ignores seasonType (unique per user+badge)
    want("A", "howl", 3, 0),
    want("B", "split_decision", 2, 2),
  ];
  const d = diffBadgeRows(rows, desired, scope);
  assert.deepEqual(d.toInsert.map(badgeRowKey), ["B|split_decision|2|2"]);
  assert.deepEqual(d.toDelete.map((r) => r.id), ["stale"]);
  assert.deepEqual(d.kept.map((r) => r.id).sort(), ["keep1", "keep2"]);
  const kept1 = d.kept.find((r) => r.id === "keep1")!;
  assert.equal(kept1.earnedAt.toISOString(), "2026-09-16T03:54:21.959Z");
});

test("diffBadgeRows: never deletes out-of-scope rows", () => {
  const rows = [
    existing("banned", "Z", "clean_sweep", 2, 1), // user not in scope (banned)
    existing("old", "A", "week_champion", 2, 0, "2025-10-01T00:00:00Z"), // earlier season
    existing("oldweek", "A", "clean_sweep", 2, 1, "2025-09-15T00:00:00Z"), // earlier season
    existing("custom", "A", "some_future_badge", 2, 0), // season badge the engine doesn't compute
    existing("otherweek", "A", "clean_sweep", 3, 1), // week not in active season
  ];
  const d = diffBadgeRows(rows, [], scope);
  assert.deepEqual(d.toDelete, []);
  assert.equal(d.kept.length, 5);
  // An out-of-scope row still satisfies the same key (no duplicate insert)
  const d2 = diffBadgeRows(rows, [want("A", "week_champion", 2, 0)], scope);
  assert.deepEqual(d2.toInsert, []);
});

test("diffBadgeRows: duplicates collapse to the oldest; legacy lifetime week rows removed", () => {
  const rows = [
    existing("dupNew", "A", "clean_sweep", 2, 1, "2026-09-20T00:00:00Z"),
    existing("dupOld", "A", "clean_sweep", 2, 1, "2026-09-16T00:00:00Z"),
    existing("legacy", "A", "steamroller", 2, 2),
    existing("life", "B", "steamroller", 2, 0),
  ];
  const d = diffBadgeRows(rows, [want("A", "clean_sweep", 2, 1), want("A", "steamroller", 2, 0)], scope);
  assert.deepEqual(d.toDelete.map((r) => r.id).sort(), ["dupNew", "legacy", "life"]);
  assert.deepEqual(d.kept.map((r) => r.id), ["dupOld"]);
  assert.deepEqual(d.toInsert.map(badgeRowKey), ["A|steamroller|0"]);
});

test("diffBadgeRows: onlyBadgeIds restricts inserts and deletes", () => {
  const rows = [existing("cs", "A", "clean_sweep", 2, 1), existing("life", "B", "steamroller", 2, 0)];
  const d = diffBadgeRows(rows, [want("A", "bite_back", 2, 0), want("A", "hot_hand", 2, 2)], {
    ...scope,
    onlyBadgeIds: new Set(["steamroller", "bite_back"]),
  });
  assert.deepEqual(d.toInsert.map(badgeRowKey), ["A|bite_back|0"]);
  assert.deepEqual(d.toDelete.map((r) => r.id), ["life"]);
});
