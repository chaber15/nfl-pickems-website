import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOdds, mapStatus, mapWithConcurrency, parseEvent, statusDetailFor } from "./espnClient.ts";

test("mapStatus: final only when completed or STATUS_FINAL*", () => {
  assert.equal(mapStatus("STATUS_FINAL", true, "post"), "final");
  assert.equal(mapStatus("STATUS_FINAL", undefined, "post"), "final");
  assert.equal(mapStatus("STATUS_FINAL_OVERTIME", false, "post"), "final");
  assert.equal(mapStatus(undefined, true, "post"), "final");
  // state "post" alone is not final
  assert.equal(mapStatus("STATUS_SOMETHING", false, "post"), "scheduled");
});

test("mapStatus: postponed / canceled / suspended / delayed-before-kickoff → scheduled", () => {
  assert.equal(mapStatus("STATUS_POSTPONED", false, "post"), "scheduled");
  assert.equal(mapStatus("STATUS_CANCELED", false, "post"), "scheduled");
  assert.equal(mapStatus("STATUS_CANCELED", true, "post"), "scheduled");
  assert.equal(mapStatus("STATUS_SUSPENDED", false, "in"), "scheduled");
  assert.equal(mapStatus("STATUS_DELAYED", false, "pre"), "scheduled");
  assert.equal(mapStatus("STATUS_RAIN_DELAY", false, "in"), "in_progress");
});

test("mapStatus: in progress", () => {
  assert.equal(mapStatus("STATUS_IN_PROGRESS", false, "in"), "in_progress");
  assert.equal(mapStatus("STATUS_HALFTIME", false, "in"), "in_progress");
  assert.equal(mapStatus("STATUS_END_PERIOD", false, "in"), "in_progress");
  assert.equal(mapStatus(undefined, false, "in"), "in_progress");
  assert.equal(mapStatus("STATUS_SCHEDULED", false, "pre"), "scheduled");
});

test("statusDetailFor keeps ESPN's postponed / canceled text", () => {
  assert.equal(statusDetailFor("STATUS_POSTPONED", "post", null, "Postponed", "Postponed"), "Postponed");
  assert.equal(statusDetailFor("STATUS_CANCELED", "post", null, "Canceled", undefined), "Canceled");
  assert.equal(statusDetailFor("STATUS_CANCELED", "post", null, undefined, undefined), "Canceled");
  assert.equal(statusDetailFor("STATUS_HALFTIME", "in", 2, "Halftime"), "Halftime");
  assert.equal(statusDetailFor("STATUS_IN_PROGRESS", "in", 5, "10:00 - OT"), "OT");
  // "Not started"-style text must not be mistaken for OT
  assert.equal(statusDetailFor("STATUS_SCHEDULED", "pre", 0, "Not started"), "Not started");
});

test("extractOdds: favorite flags, sign inference, pick'em", () => {
  assert.deepEqual(
    extractOdds({ spread: -5.5, homeTeamOdds: { favorite: true }, awayTeamOdds: { favorite: false } }),
    { spread: 5.5, favoriteSide: "home", oddsAway: null, oddsHome: null },
  );
  // No flags: ESPN's spread is home-perspective
  assert.equal(extractOdds({ spread: 2.5 }).favoriteSide, "away");
  assert.equal(extractOdds({ spread: -3 }).favoriteSide, "home");
  // Pick'em: spread 0, no favorite → home nominal favorite at 0
  assert.deepEqual(extractOdds({ spread: 0 }), { spread: 0, favoriteSide: "home", oddsAway: null, oddsHome: null });
  assert.deepEqual(extractOdds({ details: "EVEN" }).spread, 0);
  // Garbage spread → null, not NaN
  assert.deepEqual(extractOdds({ spread: "n/a" as unknown as number }), {
    spread: null,
    favoriteSide: null,
    oddsAway: null,
    oddsHome: null,
  });
  // Juice parsed from current.spread.american, EVEN → +100
  const juiced = extractOdds({
    spread: -1,
    homeTeamOdds: { favorite: true, current: { spread: { american: "EVEN" } } },
    awayTeamOdds: { current: { spread: { american: "-120" } } },
  });
  assert.equal(juiced.oddsHome, 100);
  assert.equal(juiced.oddsAway, -120);
});

const baseEvent = {
  id: "1",
  date: "2026-09-27T17:00Z",
  season: { type: 2 },
  week: { number: 3 },
  competitions: [
    {
      id: "1",
      date: "2026-09-27T17:00Z",
      competitors: [
        { homeAway: "home" as const, team: { displayName: "Home", abbreviation: "HOM" }, score: "21" },
        { homeAway: "away" as const, team: { displayName: "Away", abbreviation: "AWY" }, score: "" },
      ],
      odds: [{ spread: -3, homeTeamOdds: { favorite: true } }],
      status: { period: 4, type: { name: "STATUS_POSTPONED", state: "post", completed: false, description: "Postponed" } },
    },
  ],
};

test("parseEvent: postponed game is scheduled, not graded, keeps label; bad score → undefined", () => {
  const g = parseEvent(baseEvent)!;
  assert.equal(g.status, "scheduled");
  assert.equal(g.atsResult, null);
  assert.equal(g.statusDetail, "Postponed");
  assert.equal(g.homeScore, 21);
  assert.equal(g.awayScore, undefined);
  assert.equal(g.spread, 3);
  assert.equal(g.favoriteSide, "home");
});

test("parseEvent: malformed events are skipped, not thrown", () => {
  assert.equal(parseEvent({ ...baseEvent, competitions: [] }), null);
  assert.equal(parseEvent({ ...baseEvent, competitions: undefined }), null);
  assert.equal(
    parseEvent({ ...baseEvent, competitions: [{ ...baseEvent.competitions[0]!, competitors: undefined }] }),
    null,
  );
  assert.equal(
    parseEvent({ ...baseEvent, competitions: [{ ...baseEvent.competitions[0]!, date: "", }], date: "garbage" }),
    null,
  );
});

test("parseEvent: final game is graded against the spread", () => {
  const g = parseEvent({
    ...baseEvent,
    competitions: [
      {
        ...baseEvent.competitions[0]!,
        competitors: [
          { homeAway: "home", team: { displayName: "Home", abbreviation: "HOM" }, score: "24" },
          { homeAway: "away", team: { displayName: "Away", abbreviation: "AWY" }, score: "20" },
        ],
        status: { period: 4, type: { name: "STATUS_FINAL", state: "post", completed: true } },
      },
    ],
  })!;
  assert.equal(g.status, "final");
  assert.equal(g.atsResult, "favorite");
});

test("mapWithConcurrency keeps order and caps parallelism", async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14, 16, 18]);
  assert.equal(peak, 4);
  assert.deepEqual(await mapWithConcurrency([], 4, async (n: number) => n), []);
});
