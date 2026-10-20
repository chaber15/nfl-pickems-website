import { test } from "node:test";
import assert from "node:assert/strict";

const settingsQueries = (fake: { queries: Array<{ sql: string }> }) =>
  fake.queries.filter((q) => /from "site_settings"/.test(q.sql)).length;

test("resolveActiveSeasonId: memoized within the TTL, re-queried after invalidation", async () => {
  const { installFakeDb } = await import("../testDb");
  const { resolveActiveSeasonId, invalidateActiveSeasonCache } = await import("./sync");
  let current = "season-1";
  const fake = installFakeDb(({ sql }) =>
    /from "site_settings"/.test(sql) ? [{ current_season_id: current }] : [],
  );
  invalidateActiveSeasonCache();
  try {
    assert.equal(await resolveActiveSeasonId(), "season-1");
    current = "season-2"; // changed behind the cache
    assert.equal(await resolveActiveSeasonId(), "season-1");
    assert.equal(settingsQueries(fake), 1);

    invalidateActiveSeasonCache();
    assert.equal(await resolveActiveSeasonId(), "season-2");
    assert.equal(settingsQueries(fake), 2);
  } finally {
    invalidateActiveSeasonCache();
    fake.reset();
  }
});

test("resolveActiveSeasonId: expires after 30 s; null is never cached", async () => {
  const { installFakeDb } = await import("../testDb");
  const { resolveActiveSeasonId, invalidateActiveSeasonCache } = await import("./sync");
  const fake = installFakeDb(({ sql }) =>
    /from "site_settings"/.test(sql) ? [{ current_season_id: "season-1" }] : [],
  );
  invalidateActiveSeasonCache();
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  try {
    await resolveActiveSeasonId();
    t += 29_000;
    await resolveActiveSeasonId();
    assert.equal(settingsQueries(fake), 1);
    t += 2_000;
    await resolveActiveSeasonId();
    assert.equal(settingsQueries(fake), 2);
  } finally {
    Date.now = realNow;
    invalidateActiveSeasonCache();
    fake.reset();
  }

  const empty = installFakeDb(() => []);
  try {
    assert.equal(await resolveActiveSeasonId(), null);
    assert.equal(await resolveActiveSeasonId(), null);
    assert.equal(settingsQueries(empty), 2);
  } finally {
    invalidateActiveSeasonCache();
    empty.reset();
  }
});

test("shouldSyncWeekOnRead: pre-loaded rows skip every query and use decideReadSync", async () => {
  const { installFakeDb } = await import("../testDb");
  const { shouldSyncWeekOnRead, invalidateActiveSeasonCache } = await import("./sync");
  const fake = installFakeDb();
  invalidateActiveSeasonCache();
  try {
    // No rows → bootstrap.
    assert.equal(await shouldSyncWeekOnRead(2, 8, []), true);
    // A far-future, unstarted slate → no sync.
    const future = new Date(Date.now() + 5 * 86_400_000);
    const rows = [{ status: "scheduled", kickoffAt: future, updatedAt: new Date() }];
    assert.equal(await shouldSyncWeekOnRead(2, 8, rows), false);
    assert.equal(fake.queries.length, 0);

    // Without rows it queries on its own.
    await shouldSyncWeekOnRead(2, 8);
    assert.ok(fake.queries.length > 0);
  } finally {
    invalidateActiveSeasonCache();
    fake.reset();
  }
});
