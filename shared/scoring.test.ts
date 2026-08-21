import assert from "node:assert/strict";
import {
  computeAtsResult,
  unitsDelta,
  pickCorrectness,
  computeWinPct,
  weekPlEligible,
  isGradedForStandings,
} from "./scoring.ts";

assert.equal(computeAtsResult(27, 17, 8.5, "home"), "favorite");
assert.equal(computeAtsResult(24, 17, 7, "home"), "push");
assert.equal(computeAtsResult(20, 17, 3.5, "home"), "underdog");
assert.equal(computeAtsResult(17, 27, 8.5, "away"), "favorite");

assert.equal(unitsDelta("favorite", "favorite", "home", 150, -110), 1);
assert.equal(unitsDelta("favorite", "underdog", "home", 150, -110), -1.1);
assert.equal(unitsDelta("underdog", "underdog", "home", 150, -110), 1.5);
assert.equal(unitsDelta("underdog", "favorite", "home", 150, -110), -1);
assert.equal(unitsDelta("favorite", "push", "home", 150, -110), 0);

assert.equal(pickCorrectness("favorite", "favorite"), 1);
assert.equal(pickCorrectness("favorite", "push"), 0.5);
assert.equal(pickCorrectness(null, "favorite"), 0);
assert.equal(computeWinPct(8.5, 16), (8.5 / 16) * 100);

assert.equal(weekPlEligible("regular", 5), true);
assert.equal(weekPlEligible("regular", 4), false);
assert.equal(weekPlEligible("preseason", 5), true);
assert.equal(weekPlEligible("preseason", 3), false);
assert.equal(weekPlEligible("wildcard", 2), true);
assert.equal(isGradedForStandings({ status: "final" }), true);
assert.equal(isGradedForStandings({ status: "in_progress" }), false);
assert.equal(isGradedForStandings({ status: "scheduled" }), false);

console.log("scoring tests passed");
