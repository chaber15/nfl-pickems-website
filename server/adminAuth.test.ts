import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_COOKIE,
  SUPER_ADMIN_COOKIE,
  assertAdminPermission,
  buildUnlockCookies,
  clearAdminCookies,
  constantTimeEqual,
  evaluateUnlock,
  getTierPin,
  resolveAdminTier,
  signAdminToken,
  verifyAdminCookie,
  type AdminAction,
  type AdminTier,
} from "./adminAuth";
import { HttpError } from "./api/errors";

const ADMIN_PIN = "admin-pass-123";
const SUPER_PIN = "super-pass-456";
const env = { ADMIN_PIN, SUPER_ADMIN_PIN: SUPER_PIN };
const token = "a".repeat(64);

const regular = { isAdmin: false, isSuperAdmin: false };
const admin = { isAdmin: true, isSuperAdmin: false };
const superAdmin = { isAdmin: true, isSuperAdmin: true };

function cookieValue(setCookie: string): [string, string] {
  const [pair] = setCookie.split(";");
  const idx = pair.indexOf("=");
  return [pair.slice(0, idx), pair.slice(idx + 1)];
}

describe("admin PIN configuration", () => {
  it("treats missing or short PINs as not configured", () => {
    assert.equal(getTierPin("admin", {}), null);
    assert.equal(getTierPin("admin", { ADMIN_PIN: "short" }), null);
    assert.equal(getTierPin("admin", { ADMIN_PIN: "123456789" }), null);
    assert.equal(getTierPin("admin", { ADMIN_PIN: "1234567890" }), "1234567890");
    assert.equal(getTierPin("super", { SUPER_ADMIN_PIN: "short" }), null);
    assert.equal(getTierPin("super", env), SUPER_PIN);
  });

  it("unlock → PIN_NOT_CONFIGURED when the user's tiers have no usable PIN", () => {
    const r = evaluateUnlock(admin, "whatever-long", { ADMIN_PIN: "short" });
    assert.deepEqual(r.ok ? null : [r.status, r.code], [403, "PIN_NOT_CONFIGURED"]);
    // A regular admin can't use the super PIN even if only that one is configured.
    const r2 = evaluateUnlock(admin, SUPER_PIN, { SUPER_ADMIN_PIN: SUPER_PIN });
    assert.equal(r2.ok ? null : r2.code, "PIN_NOT_CONFIGURED");
  });
});

describe("HMAC admin cookie", () => {
  it("signs deterministically per PIN and session", () => {
    const a = signAdminToken(ADMIN_PIN, token);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, signAdminToken(ADMIN_PIN, token));
    assert.notEqual(a, signAdminToken(ADMIN_PIN, "b".repeat(64)));
    assert.notEqual(a, signAdminToken("other-pin-value", token));
  });

  it("verifies only the exact value, for the same session, under the same PIN", () => {
    const good = signAdminToken(ADMIN_PIN, token);
    assert.equal(verifyAdminCookie(ADMIN_PIN, token, good), true);
    assert.equal(verifyAdminCookie(ADMIN_PIN, "c".repeat(64), good), false, "other session");
    assert.equal(verifyAdminCookie("changed-pin-000", token, good), false, "PIN rotated");
    assert.equal(verifyAdminCookie(ADMIN_PIN, token, good.slice(0, -1)), false, "short value");
    assert.equal(verifyAdminCookie(ADMIN_PIN, token, good + "0"), false, "long value");
    assert.equal(verifyAdminCookie(ADMIN_PIN, token, undefined), false);
    assert.equal(verifyAdminCookie(null, token, good), false, "not configured");
    assert.equal(verifyAdminCookie(ADMIN_PIN, undefined, good), false, "no session");
  });

  it("constantTimeEqual compares exactly", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("abc", "abcd"), false);
    assert.equal(constantTimeEqual("", ""), true);
  });
});

describe("unlock", () => {
  it("non-admins are forbidden", () => {
    const r = evaluateUnlock(regular, ADMIN_PIN, env);
    assert.equal(r.ok ? null : r.code, "FORBIDDEN");
  });

  it("admin PIN → admin tier; super PIN only works for a super admin", () => {
    assert.deepEqual(evaluateUnlock(admin, ADMIN_PIN, env), { ok: true, tier: "admin" });
    assert.equal((evaluateUnlock(admin, SUPER_PIN, env) as { code?: string }).code, "BAD_PIN");
    assert.deepEqual(evaluateUnlock(superAdmin, SUPER_PIN, env), { ok: true, tier: "super" });
    assert.deepEqual(evaluateUnlock(superAdmin, ADMIN_PIN, env), { ok: true, tier: "admin" });
  });

  it("wrong or non-string PIN → BAD_PIN", () => {
    for (const pin of ["nope-nope-nope", "", undefined, 12345678901, ADMIN_PIN.toUpperCase()]) {
      const r = evaluateUnlock(superAdmin, pin, env);
      assert.equal(r.ok ? null : r.code, "BAD_PIN", String(pin));
    }
  });

  it("super unlock sets both cookies; admin unlock sets only the admin cookie", () => {
    const superCookies = buildUnlockCookies("super", token, true, env);
    assert.equal(superCookies.length, 2);
    for (const c of superCookies) {
      assert.match(c, /HttpOnly/);
      assert.match(c, /SameSite=Lax/);
      assert.match(c, /Path=\/api(;|$)/);
      assert.match(c, /Secure/);
    }
    const cookies = Object.fromEntries(superCookies.map(cookieValue));
    assert.equal(cookies[ADMIN_COOKIE], signAdminToken(ADMIN_PIN, token));
    assert.equal(cookies[SUPER_ADMIN_COOKIE], signAdminToken(SUPER_PIN, token));

    const adminCookies = buildUnlockCookies("admin", token, false, env);
    assert.equal(adminCookies.length, 1);
    assert.doesNotMatch(adminCookies[0], /Secure/);
    assert.equal(cookieValue(adminCookies[0])[0], ADMIN_COOKIE);
  });

  it("clearAdminCookies expires both", () => {
    const c = clearAdminCookies(false);
    assert.equal(c.length, 2);
    for (const s of c) assert.match(s, /Max-Age=0/);
  });
});

describe("resolveAdminTier", () => {
  const adminCookie = signAdminToken(ADMIN_PIN, token);
  const superCookie = signAdminToken(SUPER_PIN, token);

  it("no cookie → locked", () => {
    assert.equal(resolveAdminTier(superAdmin, token, {}, env), null);
  });
  it("valid admin cookie → admin", () => {
    assert.equal(resolveAdminTier(admin, token, { [ADMIN_COOKIE]: adminCookie }, env), "admin");
  });
  it("valid super cookie + super user → super", () => {
    assert.equal(
      resolveAdminTier(superAdmin, token, { [ADMIN_COOKIE]: adminCookie, [SUPER_ADMIN_COOKIE]: superCookie }, env),
      "super",
    );
  });
  it("super cookie ignored for a non-super user", () => {
    assert.equal(
      resolveAdminTier(admin, token, { [SUPER_ADMIN_COOKIE]: superCookie }, env),
      null,
    );
  });
  it("revoked admin flag → locked even with cookies", () => {
    assert.equal(
      resolveAdminTier({ isAdmin: false, isSuperAdmin: true }, token, { [SUPER_ADMIN_COOKIE]: superCookie }, env),
      null,
    );
  });
  it("PIN rotation invalidates cookies", () => {
    assert.equal(
      resolveAdminTier(admin, token, { [ADMIN_COOKIE]: adminCookie }, { ADMIN_PIN: "rotated-pin-99" }),
      null,
    );
  });
});

describe("admin permission matrix", () => {
  const ADMIN_OK: AdminAction[] = [
    "sync",
    "badges",
    "set_display_name",
    "set_username",
    "ban",
    "unban",
    "registration",
  ];
  const SUPER_ONLY: AdminAction[] = ["set_admin", "delete", "reset"];
  const resetOn = { ALLOW_FACTORY_RESET: "true" };
  const other = { id: "other", isSuperAdmin: false };
  const superTarget = { id: "boss", isSuperAdmin: true };

  function code(fn: () => void): string | null {
    try {
      fn();
      return null;
    } catch (err) {
      assert.ok(err instanceof HttpError);
      return err.code ?? `status:${err.status}`;
    }
  }
  const actor = (tier: AdminTier) => ({ id: "me", tier });

  it("admin tier can do admin actions on a regular user", () => {
    for (const a of ADMIN_OK) {
      assert.equal(code(() => assertAdminPermission(a, actor("admin"), other, resetOn)), null, a);
    }
  });

  it("admin tier cannot do super-only actions", () => {
    for (const a of SUPER_ONLY) {
      assert.equal(
        code(() => assertAdminPermission(a, actor("admin"), a === "reset" ? null : other, resetOn)),
        "SUPER_ADMIN_REQUIRED",
        a,
      );
    }
  });

  it("super tier can do everything (reset only when enabled)", () => {
    for (const a of [...ADMIN_OK, ...SUPER_ONLY]) {
      assert.equal(code(() => assertAdminPermission(a, actor("super"), other, resetOn)), null, a);
    }
    assert.equal(code(() => assertAdminPermission("reset", actor("super"), null, {})), "RESET_DISABLED");
    assert.equal(
      code(() => assertAdminPermission("reset", actor("super"), null, { ALLOW_FACTORY_RESET: "1" })),
      "RESET_DISABLED",
    );
  });

  it("admin tier can't touch a super admin target", () => {
    for (const a of ["ban", "set_username", "set_display_name"] as AdminAction[]) {
      assert.equal(
        code(() => assertAdminPermission(a, actor("admin"), superTarget, {})),
        "SUPER_ADMIN_PROTECTED",
        a,
      );
    }
    assert.equal(code(() => assertAdminPermission("unban", actor("admin"), superTarget, {})), null);
  });

  it("super tier may act on another super admin", () => {
    assert.equal(code(() => assertAdminPermission("ban", actor("super"), superTarget, {})), null);
  });

  it("nobody can ban/delete/demote themselves", () => {
    const self = { id: "me", isSuperAdmin: true };
    for (const a of ["ban", "delete", "set_admin"] as AdminAction[]) {
      assert.equal(code(() => assertAdminPermission(a, actor("super"), self, {})), "SELF_ACTION", a);
    }
    assert.equal(code(() => assertAdminPermission("set_display_name", actor("super"), self, {})), null);
  });
});
