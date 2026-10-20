import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { HandlerEvent } from "@netlify/functions";
import { installFakeDb } from "../testDb";
import { adminTiming, handleAdmin } from "./admin";
import { handleAuth } from "./auth";
import { buildUnlockCookies } from "../adminAuth";
import { HttpError } from "./errors";

const PIN = "correct-horse-battery";
const NOW = new Date();
const ADMIN = {
  "users.id": "admin-1",
  "users.username": "cal",
  "users.is_admin": true,
  "users.is_super_admin": false,
  "users.is_banned": false,
  "users.created_at": NOW.toISOString(),
};

before(() => {
  process.env.ADMIN_PIN = PIN;
  delete process.env.SUPER_ADMIN_PIN;
});

let sleeps = 0;
adminTiming.sleep = async () => {
  sleeps++;
};

function unlock(pin: string): HandlerEvent {
  return {
    httpMethod: "POST",
    headers: { cookie: "pickems_session=tok", "x-nf-client-connection-ip": "203.0.113.7" },
    body: JSON.stringify({ pin }),
    isBase64Encoded: false,
  } as unknown as HandlerEvent;
}

function setup(attempts: Array<Record<string, unknown>>) {
  return installFakeDb(({ sql }) => {
    if (/from "sessions"/.test(sql)) return [ADMIN];
    if (/^select .* from "admin_unlock_attempts"/s.test(sql)) return attempts;
    return [];
  });
}

let fake: ReturnType<typeof installFakeDb> | null = null;
afterEach(() => {
  fake?.reset();
  sleeps = 0;
});

describe("admin unlock lockout", () => {
  it("locked out → 429 UNLOCK_LOCKED with Retry-After, before checking the passphrase or sleeping", async () => {
    const until = new Date(NOW.getTime() + 10 * 60_000);
    fake = setup([{ user_id: null, ip: "203.0.113.7", window_start: NOW.toISOString(), failures: 5, locked_until: until.toISOString() }]);
    const res = await handleAdmin("admin/unlock", unlock(PIN)); // even the right passphrase waits
    assert.equal(res.statusCode, 429);
    assert.equal(JSON.parse(res.body).code, "UNLOCK_LOCKED");
    assert.ok(Number(res.headers["Retry-After"]) > 500);
    assert.equal(sleeps, 0);
    assert.ok(!fake.queries.some((q) => /^(insert|update|delete)/.test(q.sql)));
  });

  it("the 5th wrong passphrase in the window records a lockout for the user and the IP", async () => {
    const windowStart = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    fake = setup([
      { user_id: "admin-1", ip: null, window_start: windowStart, failures: 4, locked_until: null },
      { user_id: null, ip: "203.0.113.7", window_start: windowStart, failures: 4, locked_until: null },
    ]);
    await assert.rejects(handleAdmin("admin/unlock", unlock("wrong-passphrase")), (e: unknown) => e instanceof HttpError && e.code === "BAD_PIN");
    assert.equal(sleeps, 1);
    const upserts = fake.queries.filter((q) => /^insert into "admin_unlock_attempts"/.test(q.sql));
    assert.equal(upserts.length, 2);
    assert.equal(upserts[0].batch, upserts[1].batch);
    for (const u of upserts) {
      assert.ok(u.params.includes(5), "failures = 5");
      assert.ok(u.params.some((p) => typeof p === "string" && /^\d{4}-/.test(p) && new Date(p) > NOW), "locked_until set");
    }
  });

  it("the right passphrase clears the attempt rows and unlocks", async () => {
    fake = setup([{ user_id: "admin-1", ip: null, window_start: NOW.toISOString(), failures: 2, locked_until: null }]);
    const res = await handleAdmin("admin/unlock", unlock(PIN));
    assert.equal(res.statusCode, 200);
    assert.ok(fake.queries.some((q) => /^delete from "admin_unlock_attempts"/.test(q.sql)));
  });

  it("fails open when the attempts table is missing", async () => {
    fake = installFakeDb(({ sql }) => {
      if (/from "sessions"/.test(sql)) return [ADMIN];
      if (/admin_unlock_attempts/.test(sql)) throw new Error('relation "admin_unlock_attempts" does not exist');
      return [];
    });
    const res = await handleAdmin("admin/unlock", unlock(PIN));
    assert.equal(res.statusCode, 200);
  });
});

describe("auth/username on an admin account", () => {
  const plain = { id: "admin-1", username: "cal", display_name: "cal", is_admin: true, is_super_admin: false, is_banned: false, created_at: NOW.toISOString() };
  const rename = (cookie: string, isAdmin = true) => {
    fake = installFakeDb(({ sql }) => {
      if (/from "sessions"/.test(sql)) return [{ ...ADMIN, "users.is_admin": isAdmin }];
      if (/^select .* from "users" where "users"\."id"/s.test(sql)) return [{ ...plain, is_admin: isAdmin }];
      if (/^update "users"/.test(sql)) return [{ ...plain, is_admin: isAdmin, username: "caleb", display_name: "caleb" }];
      return [];
    });
    return handleAuth("auth/username", {
      httpMethod: "POST",
      headers: { cookie },
      body: JSON.stringify({ username: "caleb" }),
      isBase64Encoded: false,
    } as unknown as HandlerEvent);
  };

  it("without this browser's Admin unlock → 403 ADMIN_LOCKED, nothing written", async () => {
    await assert.rejects(rename("pickems_session=tok"), (e: unknown) => e instanceof HttpError && e.code === "ADMIN_LOCKED");
    assert.ok(!fake!.queries.some((q) => /^update/.test(q.sql)));
  });

  it("with a valid Admin unlock cookie → renamed", async () => {
    const cookie = buildUnlockCookies("admin", "tok", false)
      .map((c) => c.split(";")[0])
      .filter((c) => !c.endsWith("="))
      .join("; ");
    const res = await rename(`pickems_session=tok; ${cookie}`);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).user.username, "caleb");
  });

  it("a non-admin renames freely, as before", async () => {
    const res = await rename("pickems_session=tok", false);
    assert.equal(res.statusCode, 200);
  });
});
