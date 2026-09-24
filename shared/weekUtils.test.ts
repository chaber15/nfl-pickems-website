import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWeekOptions,
  clampToAvailableWeek,
  isValidPickemsWeek,
  nextAvailableWeek,
  previousAvailableWeek,
} from "./weekUtils.ts";

test("isValidPickemsWeek: regular 1–18", () => {
  assert.equal(isValidPickemsWeek(2, 1), true);
  assert.equal(isValidPickemsWeek(2, 18), true);
  assert.equal(isValidPickemsWeek(2, 0), false);
  assert.equal(isValidPickemsWeek(2, 19), false);
  assert.equal(isValidPickemsWeek(2, 99), false);
});

test("isValidPickemsWeek: playoffs use ESPN numbering (4 = Pro Bowl, 5 = Super Bowl)", () => {
  assert.equal(isValidPickemsWeek(3, 1), true);
  assert.equal(isValidPickemsWeek(3, 2), true);
  assert.equal(isValidPickemsWeek(3, 3), true);
  assert.equal(isValidPickemsWeek(3, 4), false);
  assert.equal(isValidPickemsWeek(3, 5), true);
  assert.equal(buildWeekOptions().find((o) => o.phase === "superbowl")?.week, 5);
});

test("isValidPickemsWeek: preseason, junk, non-integers", () => {
  assert.equal(isValidPickemsWeek(1, 2), false);
  assert.equal(isValidPickemsWeek(4, 1), false);
  assert.equal(isValidPickemsWeek(Number.NaN, 1), false);
  assert.equal(isValidPickemsWeek(2, 1.5), false);
});

test("week navigation skips the Pro Bowl", () => {
  assert.deepEqual(nextAvailableWeek(3, 3), { seasonType: 3, week: 5 });
  assert.deepEqual(previousAvailableWeek(3, 5), { seasonType: 3, week: 3 });
  assert.deepEqual(previousAvailableWeek(3, 1), { seasonType: 2, week: 18 });
  assert.equal(previousAvailableWeek(2, 1), null);
  assert.deepEqual(clampToAvailableWeek(3, 4), { seasonType: 3, week: 5 });
});
