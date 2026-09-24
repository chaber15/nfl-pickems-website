import { test } from "node:test";
import assert from "node:assert/strict";
import { decideScheduledSync, scheduledGate, type ScheduleRow } from "./scheduled.ts";

const at = (iso: string) => new Date(iso);

test("gate: SNF past DST end (Sun Nov 1 11:30pm EST) runs", () => {
  assert.deepEqual(scheduledGate(at("2026-11-02T04:30:00Z")), { run: true });
});

test("gate: 7am EST on Nov 1 (after DST ends) is skipped", () => {
  assert.deepEqual(scheduledGate(at("2026-11-01T12:00:00Z")), { run: false, reason: "overnight" });
});

test("gate: 8:xx is skipped, 9:00 runs — both sides of DST", () => {
  assert.equal(scheduledGate(at("2026-10-25T12:30:00Z")).run, false); // 8:30am EDT
  assert.equal(scheduledGate(at("2026-10-25T13:00:00Z")).run, true); // 9:00am EDT (London 9:30)
  assert.equal(scheduledGate(at("2026-11-08T13:30:00Z")).run, false); // 8:30am EST
  assert.equal(scheduledGate(at("2026-11-08T14:00:00Z")).run, true); // 9:00am EST
});

test("gate: after midnight until 1:59am runs; 2am skipped", () => {
  assert.equal(scheduledGate(at("2026-11-03T06:30:00Z")).run, true); // Tue 1:30am EST (MNF OT)
  assert.equal(scheduledGate(at("2026-11-03T07:00:00Z")).run, false); // 2:00am EST
  assert.equal(scheduledGate(at("2026-09-29T05:59:00Z")).run, true); // 1:59am EDT
  assert.equal(scheduledGate(at("2026-09-29T06:00:00Z")).run, false); // 2:00am EDT
});

test("gate: offseason March–July skipped; Aug–Feb allowed", () => {
  assert.deepEqual(scheduledGate(at("2026-04-15T18:00:00Z")), { run: false, reason: "offseason" });
  assert.deepEqual(scheduledGate(at("2026-07-31T18:00:00Z")), { run: false, reason: "offseason" });
  assert.equal(scheduledGate(at("2026-08-01T18:00:00Z")).run, true);
  assert.equal(scheduledGate(at("2027-02-14T23:30:00Z")).run, true); // Super Bowl evening
  assert.equal(scheduledGate(at("2027-03-01T05:30:00Z")).run, false); // Mar 1 00:30 EST
  assert.equal(scheduledGate(at("2027-03-01T04:30:00Z")).run, true); // Feb 28 23:30 EST
});

function row(p: Partial<ScheduleRow> & { kickoffAt: Date }): ScheduleRow {
  return {
    seasonType: 2,
    weekNumber: 8,
    status: "scheduled",
    updatedAt: at("2026-10-25T12:00:00Z"),
    ...p,
  };
}

test("decide: live game past kickoff (any day, e.g. Saturday) → live", () => {
  const now = at("2026-12-19T22:00:00Z"); // Saturday 5pm EST
  const d = decideScheduledSync(
    [
      row({ weekNumber: 16, kickoffAt: at("2026-12-19T21:30:00Z"), status: "in_progress", updatedAt: now }),
      row({ weekNumber: 16, kickoffAt: at("2026-12-20T18:00:00Z"), updatedAt: now }),
    ],
    now,
  );
  assert.deepEqual(d.targets, [{ seasonType: 2, week: 16, reasons: ["live"] }]);
  assert.equal(d.bootstrapCheck, false);
});

test("decide: SNF still in progress after midnight → live; previous-week needs final", () => {
  const now = at("2026-11-02T05:00:00Z"); // Mon 00:00 EST
  const d = decideScheduledSync(
    [
      row({ weekNumber: 8, kickoffAt: at("2026-11-02T01:20:00Z"), status: "in_progress" }),
      row({ weekNumber: 8, kickoffAt: at("2026-11-03T01:15:00Z") }), // MNF
    ],
    now,
  );
  assert.deepEqual(d.targets.map((t) => t.reasons), [["live"]]);
});

test("decide: kickoff within the hour → kickoff_soon", () => {
  const now = at("2026-12-25T17:00:00Z"); // Christmas noon EST
  const d = decideScheduledSync([row({ weekNumber: 17, kickoffAt: at("2026-12-25T18:00:00Z"), updatedAt: now })], now);
  assert.deepEqual(d.targets, [{ seasonType: 2, week: 17, reasons: ["kickoff_soon"] }]);
});

test("decide: pre-lock line refresh only when last update is >12h old", () => {
  const now = at("2026-09-29T16:00:00Z"); // Tue noon EDT; week 4 lock is Wed Sep 30 8am EDT
  const kick = at("2026-10-02T00:15:00Z"); // Thu night
  const stale = decideScheduledSync([row({ weekNumber: 4, kickoffAt: kick, updatedAt: at("2026-09-29T02:00:00Z") })], now);
  assert.deepEqual(stale.targets, [{ seasonType: 2, week: 4, reasons: ["line_refresh"] }]);
  const fresh = decideScheduledSync([row({ weekNumber: 4, kickoffAt: kick, updatedAt: at("2026-09-29T10:00:00Z") })], now);
  assert.deepEqual(fresh.targets, []);
  // After lock (Wed 9am EDT) no refresh even when stale
  const locked = decideScheduledSync(
    [row({ weekNumber: 4, kickoffAt: kick, updatedAt: at("2026-09-29T02:00:00Z") })],
    at("2026-09-30T13:00:00Z"),
  );
  assert.deepEqual(locked.targets, []);
});

test("decide: all final and nothing upcoming → no targets, bootstrap check", () => {
  const now = at("2026-09-29T16:00:00Z");
  const d = decideScheduledSync(
    [row({ weekNumber: 3, kickoffAt: at("2026-09-29T00:15:00Z"), status: "final" })],
    now,
  );
  assert.deepEqual(d.targets, []);
  assert.equal(d.bootstrapCheck, true);
  assert.equal(decideScheduledSync([], now).bootstrapCheck, true);
});

test("decide: game stuck non-final for days (canceled) is ignored; invalid weeks ignored", () => {
  const now = at("2026-10-10T18:00:00Z");
  const d = decideScheduledSync(
    [
      row({ weekNumber: 4, kickoffAt: at("2026-10-04T17:00:00Z"), status: "scheduled" }),
      row({ seasonType: 3, weekNumber: 4, kickoffAt: at("2026-10-10T17:00:00Z"), status: "in_progress" }),
    ],
    now,
  );
  assert.deepEqual(d.targets, []);
});
