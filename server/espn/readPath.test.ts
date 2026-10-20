import { test } from "node:test";
import assert from "node:assert/strict";

// T10: a request-path sync must not look up odds once the week is past line lock.

function event(kickoff: string) {
  return {
    id: "401",
    date: kickoff,
    competitions: [
      {
        id: "401",
        date: kickoff,
        competitors: [
          { homeAway: "away", team: { displayName: "Away Team", abbreviation: "AWY" } },
          { homeAway: "home", team: { displayName: "Home Team", abbreviation: "HOM" } },
        ],
        odds: [{ spread: -3 }], // no juice → would normally trigger the odds fallback
        status: { type: { name: "STATUS_SCHEDULED", state: "pre", completed: false } },
      },
    ],
    season: { type: 2 },
    week: { number: 8 },
  };
}

async function oddsLookups(kickoff: string, readPath: boolean) {
  const { installFakeDb } = await import("../testDb");
  const { syncEspnWeek } = await import("./sync");
  const fake = installFakeDb(({ sql }) => {
    if (/from "seasons"/.test(sql)) return [{ id: "season-1", year: 2026, label: "2026 NFL Season" }];
    if (/into "weeks"/.test(sql)) return [{ id: "week-1" }];
    return [];
  });
  const original = globalThis.fetch;
  let odds = 0;
  globalThis.fetch = (async (input: unknown) => {
    if (String(input).includes("/odds")) {
      odds++;
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ season: { type: 2, year: 2026 }, week: { number: 8 }, events: [event(kickoff)] }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    await syncEspnWeek(2, 8, { readPath, oddsDeadlineMs: 5000 });
    return odds;
  } finally {
    globalThis.fetch = original;
    fake.reset();
  }
}

test("syncEspnWeek readPath: past line lock skips every odds lookup; background sync still looks up", async () => {
  const past = "2020-10-04T17:00Z";
  assert.equal(await oddsLookups(past, true), 0);
  assert.equal(await oddsLookups(past, false), 1);
});

test("syncEspnWeek readPath: pre-lock still looks up odds (within the deadline)", async () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
  assert.equal(await oddsLookups(future, true), 1);
});
