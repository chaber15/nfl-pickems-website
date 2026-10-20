import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgeRowKey,
  computeDesiredBadges,
  diffBadgeRows,
  primetimeSlot,
  tieStandings,
  type BadgeRule,
  type DesiredBadgeRow,
  type ExistingBadgeRow,
  type SeasonSlate,
  type WeekView,
} from "./badges";
import { BADGES } from "./badgeDefs";
import { isGradedForStandings } from "./scoring";
import type { UserPick } from "./types";
import { makeGame, picksOf } from "./testFixtures";

/** Agent A's change: a final game without a line is not graded. */
const noLineFinalsUngraded = !isGradedForStandings({ status: "final", atsResult: null });

const users = ["A", "B", "C", "D"].map((u) => ({ userId: u, username: u }));

/**
 * Fixed rules for the engine tests, so they test the engine (standings, ties, streak/"first"
 * bookkeeping, incomplete weeks) and never break when the real badge list changes.
 */
const rule = (id: string, kind: "weekly" | "first", earned: (w: WeekView) => boolean): BadgeRule => ({
  id,
  name: id,
  description: id,
  icon: "🏅",
  rarity: "common",
  kind,
  earned,
});
const TEST_RULES: BadgeRule[] = [
  rule("perfect", "weekly", (w) => w.missed === 0 && w.picks.every((p) => p.result === "win")),
  rule("wipeout", "weekly", (w) => w.picks.length > 0 && w.picks.every((p) => p.result === "loss")),
  rule("unstarred", "weekly", (w) => w.picks.length > 0 && w.missedStars > 0),
  rule("missed_one", "first", (w) => w.missed > 0 && w.picks.length > 0),
  rule("lone", "weekly", (w) => w.picks.some((p) => p.result === "win" && p.crowd[p.side] === 1)),
  rule("first_lone", "first", (w) => w.picks.some((p) => p.result === "win" && p.crowd[p.side] === 1)),
  rule("top_week", "first", (w) => w.standing.ats.first),
  rule("top_pl_week", "first", (w) => w.standing.pl.first),
  rule("top_overall", "first", (w) => w.overall.ats.first),
  rule("top_pl_overall", "first", (w) => w.overall.pl.first),
  rule("last_to_first", "weekly", (w) => w.lastWeek.ats.last && w.standing.ats.first),
  rule("first_to_last", "weekly", (w) => w.lastWeek.ats.first && w.standing.ats.last),
  rule("five_stars_win", "weekly", (w) => w.starred.length === 5 && w.starred.every((p) => p.result === "win")),
  rule("five_stars_lose", "weekly", (w) => w.starred.length === 5 && w.starred.every((p) => p.result === "loss")),
];

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
    rules: TEST_RULES,
  });
  assert.deepEqual(completedWeeks, [{ seasonType: 2, weekNumber: 1 }]);

  // Co-champions and co-leaders overall; a push blocks "perfect"; nobody placed a ★ → no P/L leader
  assert.deepEqual(rowsFor(rows, "A"), ["top_overall@0", "top_week@0", "unstarred@1"]);
  assert.deepEqual(rowsFor(rows, "B"), ["top_overall@0", "top_week@0", "unstarred@1"]);
  assert.deepEqual(rowsFor(rows, "C"), ["missed_one@0", "unstarred@1", "wipeout@1"]);
  // Sat the week out: no wipeout, not ranked
  assert.deepEqual(rowsFor(rows, "D"), []);
  assert.ok(!rows.some((r) => r.badgeId === "top_pl_week"));
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
    rules: TEST_RULES,
  });
  assert.deepEqual(completedWeeks.map((w) => w.weekNumber), [1, 2]);
  assert.ok(!rows.some((r) => r.weekNumber === 3), "week 3 is in progress");

  // Week 1: A first, B last. Week 2: B first, A last.
  assert.deepEqual(rowsFor(rows, "A"), [
    "first_lone@0",
    "first_to_last@2",
    "lone@1",
    "perfect@1",
    "top_overall@0",
    "top_week@0",
    "unstarred@1",
    "unstarred@2",
    "wipeout@2",
  ]);
  // Through week 2 B (2/3) passes A (1/3) overall → top_overall from week 2 standings
  assert.deepEqual(rowsFor(rows, "B"), [
    "first_lone@0",
    "last_to_first@2",
    "lone@2",
    "perfect@2",
    "top_overall@0",
    "top_week@0",
    "unstarred@1",
    "unstarred@2",
    "wipeout@1",
  ]);
  const hr = rows.find((r) => r.userId === "B" && r.badgeId === "top_overall")!;
  assert.deepEqual(hr.source, { seasonType: 2, weekNumber: 2 });
});

test("computeDesiredBadges: ★ P/L board charges missed ★; ties share first", () => {
  const ids = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const games = ids.map((id) => makeGame(id, { atsResult: "favorite" }));
  const five = (side: "favorite" | "underdog") =>
    picksOf(Object.fromEntries(ids.map((id, i) => [id, [side, i < 5]])) as never);
  const picksByUser = new Map<string, Record<string, UserPick>>([
    ["A", five("favorite")],
    ["B", five("favorite")],
    // One losing ★ and four missed: −1.1 − 4 = −5.1
    ["C", picksOf({ p1: ["underdog", true], p2: "underdog" })],
    ["D", five("underdog")],
  ]);
  const { rows } = computeDesiredBadges({
    users,
    slates: [{ seasonType: 2, weekNumber: 1, games }],
    picksByUser,
    rules: TEST_RULES,
  });
  const weekTop = rows.filter((r) => r.badgeId === "top_pl_week").map((r) => r.userId).sort();
  assert.deepEqual(weekTop, ["A", "B"]);
  const overallTop = rows.filter((r) => r.badgeId === "top_pl_overall").map((r) => r.userId).sort();
  assert.deepEqual(overallTop, ["A", "B"]);
  assert.ok(rows.some((r) => r.userId === "C" && r.badgeId === "unstarred"));
  assert.ok(rows.some((r) => r.userId === "A" && r.badgeId === "five_stars_win"));
  assert.ok(rows.some((r) => r.userId === "D" && r.badgeId === "five_stars_lose"));
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
      rules: TEST_RULES,
    });
    // Missing the ungraded game is neither a miss nor a loss ("perfect" stands)
    assert.ok(rows.some((r) => r.badgeId === "perfect"));
    assert.ok(!rows.some((r) => r.badgeId === "missed_one"));
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
    existing("keep2", "A", "no_show", 2, 0, "2026-09-16T03:54:22.005Z"),
    existing("stale", "B", "busted_five", 2, 2),
  ];
  const desired = [
    want("A", "lone_wolf", 2, 1),
    // season_once key ignores seasonType (unique per user+badge)
    want("A", "no_show", 3, 0),
    want("B", "sniper", 2, 2),
  ];
  const d = diffBadgeRows(rows, desired, scope);
  assert.deepEqual(d.toInsert.map(badgeRowKey), ["B|sniper|2|2"]);
  assert.deepEqual(d.toDelete.map((r) => r.id), ["stale"]);
  assert.deepEqual(d.kept.map((r) => r.id).sort(), ["keep1", "keep2"]);
  const kept1 = d.kept.find((r) => r.id === "keep1")!;
  assert.equal(kept1.earnedAt.toISOString(), "2026-09-16T03:54:21.959Z");
});

test("diffBadgeRows: never deletes out-of-scope rows", () => {
  const rows = [
    existing("banned", "Z", "hot_hand", 2, 1), // user not in scope (banned)
    existing("old", "A", "week_champion", 2, 0, "2025-10-01T00:00:00Z"), // earlier season
    existing("oldweek", "A", "hot_hand", 2, 1, "2025-09-15T00:00:00Z"), // earlier season
    existing("oldretired", "A", "some_retired_badge", 2, 0, "2025-10-01T00:00:00Z"), // earlier season
    existing("otherweek", "A", "hot_hand", 3, 1), // week not in active season
  ];
  const d = diffBadgeRows(rows, [], scope);
  assert.deepEqual(d.toDelete, []);
  assert.equal(d.kept.length, 5);
  // An out-of-scope row still satisfies the same key (no duplicate insert)
  const d2 = diffBadgeRows(rows, [want("A", "week_champion", 2, 0)], scope);
  assert.deepEqual(d2.toInsert, []);
});

test("diffBadgeRows: this season's rows of a badge no longer in the list are removed", () => {
  const rows = [
    existing("retiredSeason", "A", "some_retired_badge", 2, 0),
    existing("retiredWeek", "A", "some_retired_badge", 2, 1),
  ];
  const d = diffBadgeRows(rows, [], scope);
  assert.deepEqual(d.toDelete.map((r) => r.id).sort(), ["retiredSeason", "retiredWeek"]);
});

test("diffBadgeRows: duplicates collapse to the oldest; legacy lifetime week rows removed", () => {
  const rows = [
    existing("dupNew", "A", "hot_hand", 2, 1, "2026-09-20T00:00:00Z"),
    existing("dupOld", "A", "hot_hand", 2, 1, "2026-09-16T00:00:00Z"),
    existing("legacy", "A", "steamroller", 2, 2),
    existing("life", "B", "steamroller", 2, 0),
  ];
  const d = diffBadgeRows(rows, [want("A", "hot_hand", 2, 1), want("A", "steamroller", 2, 0)], scope);
  assert.deepEqual(d.toDelete.map((r) => r.id).sort(), ["dupNew", "legacy", "life"]);
  assert.deepEqual(d.kept.map((r) => r.id), ["dupOld"]);
  assert.deepEqual(d.toInsert.map(badgeRowKey), ["A|steamroller|0"]);
});

// ── T20: badge rule fixes (real badge list) ─────────────────────────────────

const ruleHits = (rows: DesiredBadgeRow[], userId: string, badgeId: string) =>
  rows.filter((r) => r.userId === userId && r.badgeId === badgeId);

const solo = [{ userId: "A", username: "A" }];

function runSolo(games: ReturnType<typeof makeGame>[], picks: Record<string, UserPick>, seasonType = 2, weekNumber = 1) {
  return computeDesiredBadges({
    users: solo,
    slates: [{ seasonType, weekNumber, games }],
    picksByUser: new Map([["A", picks]]),
    rules: BADGES,
  }).rows;
}

test("busted_five: four losses and a push is not 'all five lose'", () => {
  const results = ["underdog", "underdog", "underdog", "underdog", "push"] as const;
  const games = results.map((atsResult, i) => makeGame(`b${i}`, { atsResult }));
  const picks = picksOf(Object.fromEntries(games.map((g) => [g.id, ["favorite", true] as const])));
  assert.equal(ruleHits(runSolo(games, picks), "A", "busted_five").length, 0);

  const allLoss = games.map((g) => ({ ...g, atsResult: "underdog" as const }));
  assert.equal(ruleHits(runSolo(allLoss, picks), "A", "busted_five").length, 1);
});

test("five_star_general / sniper / busted_five are regular season only", () => {
  const mk = (win: boolean[], n = 5) =>
    Array.from({ length: n }, (_, i) =>
      makeGame(`p${i}`, { seasonType: 3, phase: "wildcard", atsResult: win[i] ? "favorite" : "underdog" }),
    );
  const starFive = (games: ReturnType<typeof makeGame>[]) =>
    picksOf(Object.fromEntries(games.map((g, i) => [g.id, ["favorite", i < 5] as const])));

  const wins = mk([true, true, true, true, true]);
  assert.equal(ruleHits(runSolo(wins, starFive(wins), 3), "A", "five_star_general").length, 0);
  const losses = mk([false, false, false, false, false]);
  assert.equal(ruleHits(runSolo(losses, starFive(losses), 3), "A", "busted_five").length, 0);
  // Sniper: 4 of 5 stars win in a week that is mostly losses.
  const sn = mk([true, true, true, true, false, false, false, false, false, false, false], 11);
  assert.equal(ruleHits(runSolo(sn, starFive(sn), 3), "A", "sniper").length, 0);
  // The same weeks in the regular season do award them.
  const regWins = wins.map((g) => ({ ...g, seasonType: 2, phase: "regular" as const }));
  assert.equal(ruleHits(runSolo(regWins, starFive(regWins)), "A", "five_star_general").length, 1);
  const regSn = sn.map((g) => ({ ...g, seasonType: 2, phase: "regular" as const }));
  assert.equal(ruleHits(runSolo(regSn, starFive(regSn)), "A", "sniper").length, 1);
});

test("primetimeSlot: ET midnight is hour 0, not 24", () => {
  assert.equal(primetimeSlot("2026-09-11T00:15:00Z"), "tnf"); // Thu 8:15pm ET
  assert.equal(primetimeSlot("2026-09-14T00:20:00Z"), "snf"); // Sun 8:20pm ET
  assert.equal(primetimeSlot("2026-09-15T00:15:00Z"), "mnf"); // Mon 8:15pm ET
  assert.equal(primetimeSlot("2026-09-14T04:00:00Z"), null); // Mon 12:00am ET
});

test("primetime: an MNF doubleheader keeps both games (starred win on the earlier one counts)", () => {
  const games = [
    makeGame("tnf", { kickoffAt: "2026-09-11T00:15:00Z" }),
    makeGame("snf", { kickoffAt: "2026-09-14T00:20:00Z" }),
    makeGame("mnf1", { kickoffAt: "2026-09-14T23:15:00Z" }), // Mon 7:15pm ET
    makeGame("mnf2", { kickoffAt: "2026-09-15T00:15:00Z", atsResult: "underdog" }), // Mon 8:15pm ET, lost
  ];
  const picks = picksOf({
    tnf: ["favorite", true],
    snf: ["favorite", true],
    mnf1: ["favorite", true],
    mnf2: ["favorite", false],
  });
  assert.equal(ruleHits(runSolo(games, picks), "A", "primetime").length, 1);
});

test("overall ★ P/L board drops a player idle for three closed weeks (like the leaderboard)", () => {
  // Playoff weeks 1,2,3,5. A stars once (week 1, wins) then goes starless; B stars week 2 and loses.
  const overallPlFirst: BadgeRule = {
    id: "overall_pl_first",
    name: "x",
    description: "x",
    icon: "🏅",
    rarity: "common",
    kind: "weekly",
    earned: (w) => w.overall.pl.first,
  };
  const slates = [1, 2, 3, 5].map((weekNumber) => ({
    seasonType: 3,
    weekNumber,
    games: [
      makeGame(`d${weekNumber}`, {
        seasonType: 3,
        weekNumber,
        phase: "divisional",
        atsResult: weekNumber === 2 ? "underdog" : "favorite",
      }),
    ],
  }));
  const picksA = picksOf({ d1: ["favorite", true], d2: "favorite", d3: "favorite", d5: "favorite" });
  const picksB = picksOf({ d1: "favorite", d2: ["favorite", true], d3: "favorite", d5: "favorite" });
  const { rows } = computeDesiredBadges({
    users: [
      { userId: "A", username: "A" },
      { userId: "B", username: "B" },
    ],
    slates,
    picksByUser: new Map([
      ["A", picksA],
      ["B", picksB],
    ]),
    rules: [overallPlFirst],
  });
  const weeksOf = (u: string) => rows.filter((r) => r.userId === u).map((r) => r.weekNumber).sort();
  // A leads weeks 1-3 (idle only 2 closed weeks by week 3), then has dropped out by week 5.
  assert.deepEqual(weeksOf("A"), [1, 2, 3]);
  assert.deepEqual(weeksOf("B"), [5]);
});

test("lastWeek for the Super Bowl is the Conference Championship (week 5 follows week 3)", () => {
  const lastWeekFirst: BadgeRule = {
    id: "last_week_first",
    name: "x",
    description: "x",
    icon: "🏅",
    rarity: "common",
    kind: "weekly",
    earned: (w) => w.lastWeek.ats.first,
  };
  const slates = [3, 5].map((weekNumber) => ({
    seasonType: 3,
    weekNumber,
    games: [makeGame(`c${weekNumber}`, { seasonType: 3, weekNumber })],
  }));
  const { rows } = computeDesiredBadges({
    users: solo,
    slates,
    picksByUser: new Map([["A", picksOf({ c3: "favorite", c5: "favorite" })]]),
    rules: [lastWeekFirst],
  });
  assert.deepEqual(rows.map((r) => r.weekNumber), [5]);
});

function otHero(opts: Parameters<typeof makeGame>[1], pick: "favorite" | "underdog") {
  const g = makeGame("ot", opts);
  return ruleHits(runSolo([g], picksOf({ ot: [pick, true] })), "A", "ot_hero").length === 1;
}

test("OT Hero: derived from 'went to OT' + the spread, not stored pre-OT scores", () => {
  const base = {
    spread: 3.5,
    favoriteSide: "home" as const,
    homeScore: 30,
    awayScore: 24,
    atsResult: "favorite" as const,
  };
  // Favorite -3.5 wins 30-24 after OT (no pre-OT snapshot, or a stale Q4 one) -> awarded.
  assert.equal(otHero({ ...base, period: 5, statusDetail: "OT" }, "favorite"), true);
  assert.equal(otHero({ ...base, period: 5, preOtHomeScore: 24, preOtAwayScore: 17 }, "favorite"), true);
  assert.equal(otHero({ ...base, statusDetail: "OT" }, "favorite"), true);
  // Same score in regulation -> not OT.
  assert.equal(otHero({ ...base, period: 4 }, "favorite"), false);
  // Underdog backer winning in OT was never losing ATS at regulation.
  assert.equal(otHero({ ...base, homeScore: 24, awayScore: 27, atsResult: "underdog", period: 5 }, "underdog"), false);
  // Pick'em favorite: the regulation tie was a push, not a loss.
  assert.equal(otHero({ ...base, spread: 0, homeScore: 27, awayScore: 24, period: 5 }, "favorite"), false);
});
