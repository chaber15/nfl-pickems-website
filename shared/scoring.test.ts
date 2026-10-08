import assert from "node:assert/strict";
import {
  computeAtsResult,
  unitsDelta,
  pickCorrectness,
  computeWinPct,
  missedStars,
  missedStarCost,
  isWeekClosed,
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

// Each ★ short of 5 is charged; playoffs never owe any
assert.equal(missedStars("regular", 5), 0);
assert.equal(missedStars("regular", 4), 1);
assert.equal(missedStars("regular", 0), 5);
assert.equal(missedStars("preseason", 3), 2);
assert.equal(missedStars("wildcard", 2), 0);
// A missed ★ costs a loss at the worst price on the board: −122 beats −118 and the +102 side
const line = (oddsAway: number | null, oddsHome: number | null, spread: number | null = 3.5) => ({ spread, oddsAway, oddsHome });
assert.equal(missedStarCost([line(-110, -110), line(-102, -118), line(-122, 102)]), 1.22);
assert.equal(missedStarCost([line(100, -120)]), 1.2);
assert.equal(missedStarCost([line(100, 105)]), 1); // plus money risks 1
assert.equal(missedStarCost([line(-130, -130, null), line(-110, -110)]), 1.1); // no line, can't be picked
assert.equal(missedStarCost([line(null, null)]), 1.1); // no juice posted anywhere: a standard −110 loss
// A week is closed (no more ★ can be placed) once its last game has kicked off
const tue = new Date("2026-09-15T12:00:00Z");
assert.equal(isWeekClosed([{ status: "final", kickoffAt: "2026-09-13T17:00:00Z" }], tue), true);
assert.equal(
  isWeekClosed(
    [
      { status: "final", kickoffAt: "2026-09-13T17:00:00Z" },
      { status: "scheduled", kickoffAt: "2026-09-16T00:15:00Z" },
    ],
    tue,
  ),
  false,
);
// Postponed game (still "scheduled" after its kickoff) doesn't keep the week open
assert.equal(isWeekClosed([{ status: "scheduled", kickoffAt: "2026-09-13T17:00:00Z" }], tue), true);
assert.equal(isWeekClosed([], tue), false);
assert.equal(isGradedForStandings({ status: "final", atsResult: "favorite" }), true);
assert.equal(isGradedForStandings({ status: "final", atsResult: "push" }), true);
// Final with no line: excluded, not a loss
assert.equal(isGradedForStandings({ status: "final", atsResult: null }), false);
assert.equal(isGradedForStandings({ status: "final" }), false);
assert.equal(isGradedForStandings({ status: "in_progress" }), false);
assert.equal(isGradedForStandings({ status: "scheduled" }), false);

console.log("scoring tests passed");
