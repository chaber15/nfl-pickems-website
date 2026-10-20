import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { HandlerEvent } from "@netlify/functions";
import { installFakeDb } from "../testDb";
import { handlePicks } from "./picks";
import { HttpError } from "./errors";

const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
const NOW = new Date().toISOString();

const USER = {
  "users.id": "user-1",
  "users.username": "cal",
  "users.is_admin": false,
  "users.is_super_admin": false,
  "users.is_banned": false,
  "users.created_at": NOW,
};

function gameRow(over: Record<string, unknown> = {}) {
  return {
    "games.id": "game-db-1",
    "games.week_id": "week-1",
    "games.espn_event_id": "401",
    "games.away_team": "Away",
    "games.away_abbrev": "AWY",
    "games.home_team": "Home",
    "games.home_abbrev": "HOM",
    "games.kickoff_at": FUTURE,
    "games.spread_cents": 35,
    "games.favorite_side": "home",
    "games.odds_away": -110,
    "games.odds_home": -110,
    "games.status": "scheduled",
    "games.created_at": NOW,
    "games.updated_at": NOW,
    "weeks.id": "week-1",
    "weeks.season_id": "season-1",
    "weeks.week_number": 7,
    "weeks.phase": "regular",
    "weeks.season_type": 2,
    "weeks.created_at": NOW,
    ...over,
  };
}

function pickRow(isConfidenceBet: boolean) {
  return {
    id: "pick-1",
    user_id: "user-1",
    game_id: "game-db-1",
    pick: "favorite",
    is_confidence_bet: isConfidenceBet,
    created_at: NOW,
    updated_at: NOW,
  };
}

/** Fake DB for one signed-in user, one game, and (optionally) their existing pick. */
function setup(opts: { game?: Record<string, unknown>; existing?: boolean | null; capReached?: boolean } = {}) {
  return installFakeDb(({ sql }) => {
    if (/from "sessions"/.test(sql)) return [USER];
    if (/from "games" inner join "weeks"/.test(sql)) return [gameRow(opts.game)];
    if (/^select .* from "picks"/s.test(sql)) return opts.existing == null ? [] : [pickRow(opts.existing)];
    if (/^update "picks"/.test(sql)) return opts.capReached ? [] : [pickRow(!opts.existing)];
    if (/^insert into "picks"/.test(sql)) return [pickRow(false)];
    return [];
  });
}

function post(body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: "POST",
    headers: { cookie: "pickems_session=tok" },
    body: JSON.stringify({ gameId: "401", ...body }),
    isBase64Encoded: false,
  } as unknown as HandlerEvent;
}

async function rejectsWith(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (err: unknown) => err instanceof HttpError && err.code === code);
}

let fake: ReturnType<typeof installFakeDb> | null = null;
afterEach(() => fake?.reset());

describe("handlePicks: ★ cap", () => {
  it("takes a per-user advisory lock in the same transaction as the capped update", async () => {
    fake = setup({ existing: false });
    const res = await handlePicks(post({ action: "set_confidence", value: true }));
    assert.equal(res.statusCode, 200);
    const batched = fake.queries.filter((q) => q.batch != null);
    assert.equal(batched.length, 2);
    assert.equal(batched[0].batch, batched[1].batch);
    assert.match(batched[0].sql, /pg_advisory_xact_lock\(hashtext\('pickems:stars'\), hashtext\(\$1::text\)\)/);
    assert.deepEqual(batched[0].params, ["user-1"]);
    assert.match(batched[1].sql, /^update "picks" set .*"is_confidence_bet" = \$\d+.*select count\(\*\)/s);
  });

  it("over the cap → CONFIDENCE_LIMIT", async () => {
    fake = setup({ existing: false, capReached: true });
    await rejectsWith(handlePicks(post({ action: "set_confidence", value: true })), "CONFIDENCE_LIMIT");
  });
});

describe("handlePicks: postponed game with a future kickoff", () => {
  const postponed = { "games.status_detail": "Postponed" };

  it("rejects a new side pick", async () => {
    fake = setup({ game: postponed });
    await rejectsWith(handlePicks(post({ pick: "favorite" })), "GAME_POSTPONED");
    assert.ok(!fake.queries.some((q) => /^insert/.test(q.sql)));
  });

  it("rejects turning a ★ on (set or toggle)", async () => {
    fake = setup({ game: postponed, existing: false });
    await rejectsWith(handlePicks(post({ action: "set_confidence", value: true })), "GAME_POSTPONED");
    await rejectsWith(handlePicks(post({ action: "toggle_confidence" })), "GAME_POSTPONED");
    assert.ok(!fake.queries.some((q) => /^update/.test(q.sql)));
  });

  it("still lets a ★ be cleared", async () => {
    fake = setup({ game: postponed, existing: true });
    const res = await handlePicks(post({ action: "set_confidence", value: false }));
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).pick.isConfidenceBet, false);
  });

  it("a normal scheduled game still takes a pick", async () => {
    fake = setup();
    const res = await handlePicks(post({ pick: "underdog" }));
    assert.equal(res.statusCode, 200);
  });
});
