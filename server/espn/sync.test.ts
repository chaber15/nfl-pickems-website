import { test } from "node:test";
import assert from "node:assert/strict";
import { decideReadSync, mergeGameState, resolvePreOtScores, type ReadSyncRow } from "./sync.ts";

const line = { spread: 3, favoriteSide: "home" as const };
const storedFinal = {
  status: "final" as const,
  awayScore: 17,
  homeScore: 24,
  atsResult: "favorite" as const,
  period: 4,
  displayClock: "0:00",
  statusDetail: "Final",
};

test("merge: stored final never regresses to in_progress / scheduled", () => {
  const out = mergeGameState(
    storedFinal,
    { status: "in_progress", awayScore: 0, homeScore: 0, period: 1, displayClock: "15:00", statusDetail: "Q1" },
    line,
  );
  assert.equal(out.status, "final");
  assert.equal(out.awayScore, 17);
  assert.equal(out.homeScore, 24);
  assert.equal(out.atsResult, "favorite");
  assert.equal(out.statusDetail, "Final");
});

test("merge: null incoming scores never overwrite stored scores", () => {
  const out = mergeGameState(
    { ...storedFinal, status: "in_progress", atsResult: null },
    { status: "in_progress", awayScore: undefined, homeScore: undefined, period: 3 },
    line,
  );
  assert.equal(out.awayScore, 17);
  assert.equal(out.homeScore, 24);
  assert.equal(out.atsResult, null);
});

test("merge: final with complete data is graded; stat correction regrades", () => {
  const out = mergeGameState(null, { status: "final", awayScore: 20, homeScore: 22 }, line);
  assert.equal(out.atsResult, "underdog");
  const corrected = mergeGameState(storedFinal, { status: "final", awayScore: 21, homeScore: 24 }, line);
  assert.equal(corrected.atsResult, "push");
});

test("merge: final atsResult is kept (not cleared) when the line is missing", () => {
  const out = mergeGameState(storedFinal, { status: "final", awayScore: 17, homeScore: 24 }, {
    spread: null,
    favoriteSide: null,
  });
  assert.equal(out.atsResult, "favorite");
  // Newly final with no line: stays ungraded (excluded from standings)
  const fresh = mergeGameState(null, { status: "final", awayScore: 17, homeScore: 24 }, { spread: null, favoriteSide: null });
  assert.equal(fresh.atsResult, null);
});

test("merge: postponed (scheduled) game is never graded", () => {
  const out = mergeGameState(null, { status: "scheduled", awayScore: 0, homeScore: 0, statusDetail: "Postponed" }, line);
  assert.equal(out.atsResult, null);
  assert.equal(out.statusDetail, "Postponed");
});

test("pick'em line merge: home nominal favorite at 0 grades straight-up; tie → push", () => {
  const pk = { spread: 0, favoriteSide: "home" as const };
  assert.equal(mergeGameState(null, { status: "final", awayScore: 10, homeScore: 13 }, pk).atsResult, "favorite");
  assert.equal(mergeGameState(null, { status: "final", awayScore: 13, homeScore: 10 }, pk).atsResult, "underdog");
  assert.equal(mergeGameState(null, { status: "final", awayScore: 13, homeScore: 13 }, pk).atsResult, "push");
});

test("pre-OT snapshot: end of regulation tie, OT detection by word only", () => {
  const none = { preOtAwayScore: null, preOtHomeScore: null, awayScore: 20, homeScore: 17, period: 4, statusDetail: "4:00" };
  // End of Q4 tied → snapshot
  assert.deepEqual(
    resolvePreOtScores(none, { period: 4, statusDetail: "End of Q4", awayScore: 20, homeScore: 20 }),
    { preOtAwayScore: 20, preOtHomeScore: 20 },
  );
  // Words containing "ot" are not OT
  assert.deepEqual(
    resolvePreOtScores(none, { period: 4, statusDetail: "Not started", awayScore: 20, homeScore: 20 }),
    { preOtAwayScore: null, preOtHomeScore: null },
  );
  // First OT sighting: prefer stored regulation scores
  assert.deepEqual(
    resolvePreOtScores(
      { ...none, awayScore: 20, homeScore: 20 },
      { period: 5, statusDetail: "OT", awayScore: 26, homeScore: 20 },
    ),
    { preOtAwayScore: 20, preOtHomeScore: 20 },
  );
  // Already snapshotted: kept
  assert.deepEqual(
    resolvePreOtScores(
      { ...none, preOtAwayScore: 20, preOtHomeScore: 20 },
      { period: 5, statusDetail: "OT", awayScore: 26, homeScore: 20 },
    ),
    { preOtAwayScore: 20, preOtHomeScore: 20 },
  );
});

const d = (iso: string) => new Date(iso);
function r(kickoff: string, status: string, updated: string): ReadSyncRow {
  return { kickoffAt: d(kickoff), status, updatedAt: d(updated) };
}

test("read sync: empty week bootstraps", () => {
  assert.equal(decideReadSync([], d("2026-10-01T12:00:00Z")), true);
});

test("read sync: SNF past midnight still live → sync (throttled)", () => {
  const now = d("2026-11-02T05:30:00Z"); // Mon 12:30am EST
  const rows = [r("2026-11-02T01:20:00Z", "in_progress", "2026-11-02T05:20:00Z"), r("2026-11-01T18:00:00Z", "final", "2026-11-01T21:30:00Z")];
  assert.equal(decideReadSync(rows, now), true);
  // Updated 2 minutes ago → throttled
  const fresh = [r("2026-11-02T01:20:00Z", "in_progress", "2026-11-02T05:28:00Z")];
  assert.equal(decideReadSync(fresh, now), false);
});

test("read sync: Saturday / Christmas games sync when live", () => {
  assert.equal(
    decideReadSync([r("2026-12-19T21:30:00Z", "in_progress", "2026-12-19T22:00:00Z")], d("2026-12-19T22:10:00Z")),
    true,
  );
  assert.equal(
    decideReadSync([r("2026-12-25T18:00:00Z", "scheduled", "2026-12-25T12:00:00Z")], d("2026-12-25T17:55:00Z")),
    true, // 5 min before kickoff
  );
});

test("read sync: upcoming (>10 min) or all-final weeks don't sync", () => {
  assert.equal(
    decideReadSync([r("2026-12-25T18:00:00Z", "scheduled", "2026-12-24T12:00:00Z")], d("2026-12-25T17:30:00Z")),
    false,
  );
  assert.equal(
    decideReadSync([r("2026-10-04T17:00:00Z", "final", "2026-10-04T21:00:00Z")], d("2026-10-05T12:00:00Z")),
    false,
  );
  // Canceled game stuck "scheduled" days later: no endless polling
  assert.equal(
    decideReadSync([r("2026-10-04T17:00:00Z", "scheduled", "2026-10-04T21:00:00Z")], d("2026-10-09T12:00:00Z")),
    false,
  );
});
