import { test } from "node:test";
import assert from "node:assert/strict";

// Season-rollover guards (T8): raw ESPN season type gates the scheduler bootstrap, and only an
// explicit option pins site_settings.current_season_id.

type Json = Record<string, unknown>;

function stubFetch(scoreboard: (url: URL) => Json) {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    return new Response(JSON.stringify(scoreboard(url)), { status: 200 });
  }) as typeof fetch;
  return { urls, restore: () => void (globalThis.fetch = original) };
}

const event = {
  id: "401",
  date: "2026-10-25T17:00Z",
  competitions: [
    {
      id: "401",
      date: "2026-10-25T17:00Z",
      competitors: [
        { homeAway: "away", team: { displayName: "Away Team", abbreviation: "AWY" } },
        { homeAway: "home", team: { displayName: "Home Team", abbreviation: "HOM" } },
      ],
      odds: [
        {
          spread: -3,
          awayTeamOdds: { spreadOdds: -110 },
          homeTeamOdds: { favorite: true, spreadOdds: -110 },
        },
      ],
      status: { type: { name: "STATUS_SCHEDULED", state: "pre", completed: false } },
    },
  ],
  season: { type: 2 },
  week: { number: 8 },
};

test("resolveCurrentPickemsWeek: ESPN type 1 → rawSeasonType 1, clamped to regular week 1", async () => {
  const { resolveCurrentPickemsWeek } = await import("../../shared/espnClient");
  const f = stubFetch(() => ({ season: { type: 1, year: 2026 }, week: { number: 3 }, events: [] }));
  try {
    const cur = await resolveCurrentPickemsWeek(new Date("2026-08-20T17:00:00Z"));
    assert.equal(cur.rawSeasonType, 1);
    assert.equal(cur.seasonType, 2);
    assert.equal(cur.week, 1);
  } finally {
    f.restore();
  }
});

for (const rawType of [1, 4]) {
  test(`scheduler bootstrap is skipped when ESPN reports season type ${rawType}`, async () => {
    const { installFakeDb } = await import("../testDb");
    const { runScheduledEspnSync } = await import("./scheduled");
    const fake = installFakeDb();
    const f = stubFetch(() => ({ season: { type: rawType, year: 2026 }, week: { number: 1 }, events: [] }));
    try {
      const out = await runScheduledEspnSync(new Date("2026-10-22T17:00:00Z"));
      assert.deepEqual(out, { skipped: "nothing_due", synced: [] });
      assert.equal(fake.queries.filter((q) => /^insert/i.test(q.sql)).length, 0, "nothing synced or written");
    } finally {
      f.restore();
      fake.reset();
    }
  });
}

async function runSync(opts?: { pinActiveSeason?: boolean }) {
  const { installFakeDb } = await import("../testDb");
  const { syncEspnWeek } = await import("./sync");
  const fake = installFakeDb(({ sql }) => {
    if (/from "seasons"/.test(sql)) return [{ id: "season-1", year: 2026, label: "2026 NFL Season" }];
    if (/into "weeks"/.test(sql)) return [{ id: "week-1" }];
    return [];
  });
  const f = stubFetch(() => ({ season: { type: 2, year: 2026 }, week: { number: 8 }, events: [event] }));
  try {
    await syncEspnWeek(2, 8, opts);
    return fake.queries.filter((q) => /into "site_settings"/.test(q.sql)).length;
  } finally {
    f.restore();
    fake.reset();
  }
}

test("syncEspnWeek: pins the active season only when pinActiveSeason is set", async () => {
  assert.equal(await runSync(), 0);
  assert.equal(await runSync({ pinActiveSeason: false }), 0);
  assert.equal(await runSync({ pinActiveSeason: true }), 1);
});
