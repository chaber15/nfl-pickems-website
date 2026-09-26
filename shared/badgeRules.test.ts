import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BADGES } from "./badgeDefs";
import {
  BADGE_CATALOG,
  badgeDiffFingerprint,
  computeDesiredBadges,
  describeBadgeChanges,
  diffBadgeRows,
  groupEarnedBadges,
  isDisplayableBadgeAward,
  validateBadgeRules,
  type BadgeRule,
  type DesiredBadgeRow,
  type ExistingBadgeRow,
} from "./badges";
import { makeGame, makeRandomSeason, picksOf } from "./testFixtures";

// ── the list itself ─────────────────────────────────────────────────────────

test("badge list: valid, and the catalog lists every badge rarest first", () => {
  validateBadgeRules(BADGES);
  assert.equal(BADGE_CATALOG.length, BADGES.length);
  for (let i = 1; i < BADGE_CATALOG.length; i++) {
    assert.ok(BADGE_CATALOG[i - 1]!.rarity >= BADGE_CATALOG[i]!.rarity);
  }
});

test("validateBadgeRules: rejects duplicate ids, bad ids and bad goals", () => {
  const base = { name: "X", description: "x", icon: "🏅", rarity: "common" as const };
  const weekly = (id: string): BadgeRule => ({ ...base, id, kind: "weekly", earned: () => true });
  assert.throws(() => validateBadgeRules([weekly("a"), weekly("a")]), /Duplicate/);
  assert.throws(() => validateBadgeRules([weekly("Bad Id")]), /snake_case/);
  assert.throws(
    () => validateBadgeRules([{ ...base, id: "c", kind: "count", goal: 0, count: () => 1 }]),
    /goal/,
  );
  assert.throws(() => validateBadgeRules([{ ...weekly("d"), icon: "" }]), /needs an icon/);
  assert.throws(() => validateBadgeRules([{ ...weekly("e"), icon: "🔄" }]), /square "button" emoji/);
  assert.throws(() => validateBadgeRules([{ ...weekly("f"), icon: "🔂" }]), /square "button" emoji/);
  validateBadgeRules([{ ...weekly("g"), icon: "⏱️" }, { ...weekly("h"), icon: "🕸️" }]);
});

test("groupEarnedBadges: one entry per badge, repeats counted, weeks in order, rarest first", () => {
  const earned = (badgeId: string, name: string, weekNumber: number | null, earnedAt: string, seasonType = 2) => ({
    badgeId,
    name,
    description: "",
    seasonType,
    weekNumber,
    earnedAt,
  });
  const groups = groupEarnedBadges([
    earned("sniper", "Sniper", 7, "2026-10-28T00:00:00Z"),
    earned("week_champion", "Week Champion", null, "2026-09-16T00:00:00Z"),
    earned("sniper", "Sniper", 2, "2026-09-16T00:00:00Z"),
    earned("crystal_ball", "Crystal Ball", 9, "2026-11-10T00:00:00Z"),
    earned("sniper", "Sniper", 1, "2027-01-12T00:00:00Z", 3),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.badgeId, g.count]),
    [["crystal_ball", 1], ["sniper", 3], ["week_champion", 1]],
  );
  const sniper = groups[1]!;
  assert.deepEqual(sniper.weeks.map((w) => `${w.seasonType}-${w.weekNumber}`), ["2-2", "2-7", "3-1"]);
  assert.equal(sniper.earnedAt, "2027-01-12T00:00:00Z");
  assert.deepEqual(groups[2]!.weeks, []);
});

test("isDisplayableBadgeAward: hides retired ids and rows whose week doesn't fit the kind", () => {
  assert.equal(isDisplayableBadgeAward("hot_hand", 3), true);
  assert.equal(isDisplayableBadgeAward("hot_hand", 0), false);
  assert.equal(isDisplayableBadgeAward("no_show", 0), true);
  assert.equal(isDisplayableBadgeAward("no_show", 4), false);
  assert.equal(isDisplayableBadgeAward("steamroller", 0), true);
  assert.equal(isDisplayableBadgeAward("steamroller", 2), false);
  assert.equal(isDisplayableBadgeAward("some_retired_badge", 0), false);
});

// ── kinds ───────────────────────────────────────────────────────────────────

test("kinds: weekly repeats, first keeps the first week, count awards when the total reaches goal", () => {
  const rules: BadgeRule[] = [
    { id: "any_win", name: "W", description: "w", icon: "🏅", rarity: "common", kind: "weekly", earned: (w) => w.winPct > 0 },
    { id: "first_win", name: "F", description: "f", icon: "🏅", rarity: "common", kind: "first", earned: (w) => w.winPct > 0 },
    {
      id: "three_wins",
      name: "C",
      description: "c",
      icon: "🏅",
      rarity: "common",
      kind: "count",
      goal: 3,
      count: (w) => w.picks.filter((p) => p.result === "win").length,
    },
  ];
  const slates = [1, 2, 3].map((wk) => ({
    seasonType: 2,
    weekNumber: wk,
    games: [makeGame(`g${wk}a`, { weekNumber: wk }), makeGame(`g${wk}b`, { weekNumber: wk })],
  }));
  // Wins: week 1 → 1, week 2 → 2 (total 3 → count badge here), week 3 → 1.
  const picks = picksOf({ g1a: "favorite", g1b: "underdog", g2a: "favorite", g2b: "favorite", g3a: "favorite" });
  const { rows } = computeDesiredBadges({
    users: [{ userId: "A", username: "a" }],
    slates,
    picksByUser: new Map([["A", picks]]),
    rules,
  });
  const byId = (id: string) => rows.filter((r) => r.badgeId === id);
  assert.deepEqual(byId("any_win").map((r) => r.weekNumber), [1, 2, 3]);
  assert.deepEqual(byId("first_win").map((r) => [r.weekNumber, r.source.weekNumber]), [[0, 1]]);
  assert.deepEqual(byId("three_wins").map((r) => [r.weekNumber, r.source.weekNumber]), [[0, 2]]);
});

// ── preview ─────────────────────────────────────────────────────────────────

test("describeBadgeChanges + fingerprint: readable, order-independent, sensitive to any change", () => {
  const row = (id: string, badgeId: string, weekNumber: number): ExistingBadgeRow => ({
    id,
    userId: "A",
    badgeId,
    seasonType: 2,
    weekNumber,
    earnedAt: new Date("2026-09-16T00:00:00Z"),
  });
  const add: DesiredBadgeRow = {
    userId: "B",
    badgeId: "sniper",
    seasonType: 2,
    weekNumber: 3,
    source: { seasonType: 2, weekNumber: 3 },
  };
  const diff = { toInsert: [add], toDelete: [row("r1", "some_retired_badge", 0), row("r2", "no_show", 0)], kept: [] };
  const changes = describeBadgeChanges(diff, [
    { userId: "A", username: "annie", displayName: "Annie" },
    { userId: "B", username: "bob" },
  ]);
  assert.deepEqual(
    changes.map((c) => [c.player, c.action, c.badgeName, c.weekNumber, c.note ?? ""]),
    [
      ["Annie", "remove", "No Show", null, ""],
      ["Annie", "remove", "Some Retired Badge", null, "badge no longer in the list"],
      ["bob", "add", "Sniper", 3, ""],
    ],
  );

  const fp = badgeDiffFingerprint(diff);
  assert.equal(fp, badgeDiffFingerprint({ toInsert: [add], toDelete: [...diff.toDelete].reverse() }));
  assert.notEqual(fp, badgeDiffFingerprint({ toInsert: [], toDelete: diff.toDelete }));
  assert.notEqual(fp, badgeDiffFingerprint({ toInsert: [add], toDelete: [diff.toDelete[0]!] }));
});

test("diff is idempotent: applying it leaves nothing to change", () => {
  const input = makeRandomSeason(7);
  const { rows } = computeDesiredBadges(input);
  const scope = {
    userIds: new Set(input.users.map((u) => u.userId)),
    weekKeys: new Set(input.slates.map((s) => `${s.seasonType}-${s.weekNumber}`)),
    seasonStartedAt: null,
  };
  const first = diffBadgeRows([], rows, scope);
  const applied: ExistingBadgeRow[] = first.toInsert.map((r, i) => ({
    id: `id${i}`,
    userId: r.userId,
    badgeId: r.badgeId,
    seasonType: r.seasonType,
    weekNumber: r.weekNumber,
    earnedAt: new Date(),
  }));
  const second = diffBadgeRows(applied, rows, scope);
  assert.equal(second.toInsert.length, 0);
  assert.equal(second.toDelete.length, 0);
});

// ── golden season snapshot ──────────────────────────────────────────────────
//
// Runs every rule over fixed synthetic seasons and compares with the committed snapshot.
// If you changed a rule ON PURPOSE, the failure lists exactly who gains/loses what; accept it with
//   UPDATE_SNAPSHOTS=1 npm test

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), "__snapshots__", "badges.golden.json");
const GOLDEN_SEEDS = [11, 22, 33];

function goldenRows(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const seed of GOLDEN_SEEDS) {
    const { rows } = computeDesiredBadges(makeRandomSeason(seed));
    out[`season ${seed}`] = rows
      .map((r) => `${r.userId} ${r.badgeId} ${r.weekNumber === 0 ? "season" : `${r.seasonType}-${r.weekNumber}`}`)
      .sort();
  }
  return out;
}

test("golden season snapshot: badge results only change when a rule changes", () => {
  const actual = goldenRows();
  if (process.env.UPDATE_SNAPSHOTS === "1" || !existsSync(SNAPSHOT)) {
    mkdirSync(dirname(SNAPSHOT), { recursive: true });
    writeFileSync(SNAPSHOT, `${JSON.stringify(actual, null, 1)}\n`);
    return;
  }
  const expected = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Record<string, string[]>;
  const lines: string[] = [];
  for (const season of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const was = new Set(expected[season] ?? []);
    const now = new Set(actual[season] ?? []);
    for (const r of now) if (!was.has(r)) lines.push(`  ${season}: + ${r}`);
    for (const r of was) if (!now.has(r)) lines.push(`  ${season}: − ${r}`);
  }
  assert.ok(
    lines.length === 0,
    `Badge results changed (${lines.length}). If intended, run UPDATE_SNAPSHOTS=1 npm test\n${lines.join("\n")}`,
  );
});
