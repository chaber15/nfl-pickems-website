import assert from "node:assert/strict";
import {
  computeLineLockAt,
  hasCompleteLine,
  resolveLineFields,
  shouldRefreshLine,
  zonedWallTimeToUtc,
} from "./lineLock.ts";

// 2026 regular season week 1 opener: Thu Sep 10 2026 ~8:20pm ET
const thuKickoff = "2026-09-11T00:20:00.000Z"; // 8:20pm EDT Sep 10
const lockAt = computeLineLockAt([thuKickoff]);
assert.ok(lockAt);
// Wednesday Sep 9 2026 8:00 AM ET = 12:00 UTC (EDT)
const expected = zonedWallTimeToUtc(2026, 9, 9, 8, 0, "America/New_York");
assert.equal(lockAt!.toISOString(), expected.toISOString());

assert.equal(shouldRefreshLine(null, { spread: 3, favoriteSide: "home", oddsAway: -110, oddsHome: -110 }, false), true);
assert.equal(
  shouldRefreshLine(
    { spread: 3, favoriteSide: "home", oddsAway: -110, oddsHome: -110 },
    { spread: 4, favoriteSide: "home", oddsAway: -105, oddsHome: -115 },
    true,
  ),
  false,
);
assert.equal(
  shouldRefreshLine({ spread: 3, favoriteSide: "home", oddsAway: null, oddsHome: null }, { spread: 3, favoriteSide: "home", oddsAway: -110, oddsHome: -110 }, true),
  true,
);

const frozen = resolveLineFields(
  { spread: 3.5, favoriteSide: "away", oddsAway: -108, oddsHome: -112 },
  { spread: 7, favoriteSide: "home", oddsAway: -110, oddsHome: -110 },
  true,
);
assert.equal(frozen.spread, 3.5);
assert.equal(frozen.favoriteSide, "away");
assert.ok(hasCompleteLine(frozen));

console.log("lineLock tests passed");
