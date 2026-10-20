import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { HandlerEvent } from "@netlify/functions";
import { installFakeDb } from "../testDb";
import { invalidateActiveSeasonCache } from "../espn/sync";
import { handleCalendar } from "./games";
import { HttpError } from "./errors";

const event = { httpMethod: "GET", queryStringParameters: {} } as unknown as HandlerEvent;

/** Fake DB: an active season, plus the (seasonType, week) rows each query should return. */
function setup(rows: { upcoming?: [number, number]; latest?: [number, number] }) {
  invalidateActiveSeasonCache();
  const fake = installFakeDb(({ sql }) => {
    if (/from "site_settings"/.test(sql)) return [{ current_season_id: "season-1" }];
    if (/from "games"/.test(sql)) {
      const hit = /"games"\."kickoff_at" >/.test(sql) ? rows.upcoming : rows.latest;
      return hit ? [{ "weeks.season_type": hit[0], "weeks.week_number": hit[1] }] : [];
    }
    return [];
  });
  return fake;
}

function failEspn() {
  mock.method(globalThis, "fetch", async () => {
    throw new Error("ESPN down");
  });
}

describe("calendar/current DB fallback", () => {
  it("ESPN down → earliest upcoming week from the DB, marked db-fallback", async () => {
    failEspn();
    const fake = setup({ upcoming: [2, 8], latest: [2, 18] });
    try {
      const res = await handleCalendar("calendar/current", event);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(JSON.parse(res.body), { seasonType: 2, week: 8, source: "db" });
      assert.equal(res.headers?.["X-Pickems-Source"], "db-fallback");
    } finally {
      mock.restoreAll();
      invalidateActiveSeasonCache();
      fake.reset();
    }
  });

  it("no upcoming game → latest week with rows", async () => {
    failEspn();
    const fake = setup({ latest: [2, 17] });
    try {
      const res = await handleCalendar("calendar/current", event);
      assert.deepEqual(JSON.parse(res.body), { seasonType: 2, week: 17, source: "db" });
    } finally {
      mock.restoreAll();
      invalidateActiveSeasonCache();
      fake.reset();
    }
  });

  it("ESPN down and nothing in the DB → 503", async () => {
    failEspn();
    const fake = setup({});
    try {
      await assert.rejects(
        () => handleCalendar("calendar/current", event),
        (err: unknown) => err instanceof HttpError && err.status === 503,
      );
    } finally {
      mock.restoreAll();
      invalidateActiveSeasonCache();
      fake.reset();
    }
  });
});
