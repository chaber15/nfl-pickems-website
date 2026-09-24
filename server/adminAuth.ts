import { createHmac, timingSafeEqual } from "crypto";
import { HttpError } from "./api/errors";

/**
 * Admin unlock: a second factor on top of the (username-only) session.
 * Two tiers, each with its own passphrase env var and its own cookie:
 *   ADMIN_PIN       → "admin" tier  (cookie pickems_admin)
 *   SUPER_ADMIN_PIN → "super" tier  (cookie pickems_super)
 * Cookie value = HMAC-SHA256(key = PIN, msg = session token), hex. Changing the
 * env PIN or logging out (new session token) invalidates it.
 */

export type AdminTier = "admin" | "super";

export const ADMIN_COOKIE = "pickems_admin";
export const SUPER_ADMIN_COOKIE = "pickems_super";
export const MIN_PIN_LENGTH = 10;
const ADMIN_COOKIE_MAX_AGE = 12 * 60 * 60;

type Env = Record<string, string | undefined>;

/** The configured PIN for a tier, or null when missing / shorter than 10 chars. */
export function getTierPin(tier: AdminTier, env: Env = process.env): string | null {
  const raw = tier === "super" ? env.SUPER_ADMIN_PIN : env.ADMIN_PIN;
  if (typeof raw !== "string" || raw.length < MIN_PIN_LENGTH) return null;
  return raw;
}

export function signAdminToken(pin: string, sessionToken: string): string {
  return createHmac("sha256", pin).update(sessionToken).digest("hex");
}

/** Constant-time string equality (hashes both sides so length doesn't leak). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "pickems-compare").update(a).digest();
  const hb = createHmac("sha256", "pickems-compare").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

export function verifyAdminCookie(
  pin: string | null,
  sessionToken: string | undefined,
  cookieValue: string | undefined,
): boolean {
  if (!pin || !sessionToken || !cookieValue) return false;
  const expected = Buffer.from(signAdminToken(pin, sessionToken), "utf8");
  const given = Buffer.from(cookieValue, "utf8");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(expected, given);
}

export interface AdminActor {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/** Which unlocked tier (if any) this request carries. */
export function resolveAdminTier(
  user: AdminActor,
  sessionToken: string | undefined,
  cookies: Record<string, string>,
  env: Env = process.env,
): AdminTier | null {
  if (!user.isAdmin) return null;
  if (
    user.isSuperAdmin &&
    verifyAdminCookie(getTierPin("super", env), sessionToken, cookies[SUPER_ADMIN_COOKIE])
  ) {
    return "super";
  }
  if (verifyAdminCookie(getTierPin("admin", env), sessionToken, cookies[ADMIN_COOKIE])) {
    return "admin";
  }
  return null;
}

export type UnlockResult =
  | { ok: true; tier: AdminTier }
  | { ok: false; status: number; code: "FORBIDDEN" | "PIN_NOT_CONFIGURED" | "BAD_PIN"; error: string };

/** Pure decision for POST /api/admin/unlock. */
export function evaluateUnlock(user: AdminActor, pin: unknown, env: Env = process.env): UnlockResult {
  if (!user.isAdmin) {
    return { ok: false, status: 403, code: "FORBIDDEN", error: "Admins only" };
  }
  const superPin = user.isSuperAdmin ? getTierPin("super", env) : null;
  const adminPin = getTierPin("admin", env);
  if (!superPin && !adminPin) {
    return {
      ok: false,
      status: 403,
      code: "PIN_NOT_CONFIGURED",
      error: "Admin unlock isn't set up on the server",
    };
  }
  const input = typeof pin === "string" ? pin : "";
  // Evaluate both comparisons regardless of outcome (no early exit timing).
  const superMatch = superPin ? constantTimeEqual(input, superPin) : false;
  const adminMatch = adminPin ? constantTimeEqual(input, adminPin) : false;
  if (superMatch) return { ok: true, tier: "super" };
  if (adminMatch) return { ok: true, tier: "admin" };
  return { ok: false, status: 403, code: "BAD_PIN", error: "Wrong passphrase" };
}

function cookieAttrs(secure: boolean, maxAge: number): string {
  const parts = ["HttpOnly", "Path=/api", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Set-Cookie values for a successful unlock of `tier`. */
export function buildUnlockCookies(
  tier: AdminTier,
  sessionToken: string,
  secure: boolean,
  env: Env = process.env,
): string[] {
  const cookies: string[] = [];
  const attrs = cookieAttrs(secure, ADMIN_COOKIE_MAX_AGE);
  const adminPin = getTierPin("admin", env);
  if (adminPin) cookies.push(`${ADMIN_COOKIE}=${signAdminToken(adminPin, sessionToken)}; ${attrs}`);
  if (tier === "super") {
    const superPin = getTierPin("super", env);
    if (superPin) {
      cookies.push(`${SUPER_ADMIN_COOKIE}=${signAdminToken(superPin, sessionToken)}; ${attrs}`);
    }
  }
  return cookies;
}

export function clearAdminCookies(secure: boolean): string[] {
  const attrs = cookieAttrs(secure, 0);
  return [`${ADMIN_COOKIE}=; ${attrs}`, `${SUPER_ADMIN_COOKIE}=; ${attrs}`];
}

// ── Permission matrix ────────────────────────────────────────────────────────

export const ADMIN_TIER_ACTIONS = [
  "sync",
  "badges",
  "set_display_name",
  "set_username",
  "ban",
  "unban",
  "registration",
] as const;
export const SUPER_TIER_ACTIONS = ["set_admin", "delete", "reset"] as const;
export type AdminAction = (typeof ADMIN_TIER_ACTIONS)[number] | (typeof SUPER_TIER_ACTIONS)[number];

/** Actions a regular admin can't perform against a super admin. */
const PROTECTS_SUPER_TARGET = new Set<AdminAction>([
  "ban",
  "set_username",
  "set_display_name",
  "set_admin",
  "delete",
]);
/** Actions nobody can perform on themselves. */
const NOT_ON_SELF = new Set<AdminAction>(["ban", "delete", "set_admin"]);

export function isAdminAction(action: unknown): action is AdminAction {
  return (
    typeof action === "string" &&
    ((ADMIN_TIER_ACTIONS as readonly string[]).includes(action) ||
      (SUPER_TIER_ACTIONS as readonly string[]).includes(action))
  );
}

/**
 * Throws an HttpError when `tier` may not perform `action` on `target`.
 * `target` is null for actions without a user target.
 */
export function assertAdminPermission(
  action: AdminAction,
  actor: { id: string; tier: AdminTier },
  target: { id: string; isSuperAdmin: boolean } | null,
  env: Env = process.env,
): void {
  const superOnly = (SUPER_TIER_ACTIONS as readonly string[]).includes(action);
  if (superOnly && actor.tier !== "super") {
    throw new HttpError(403, "Only the super admin can do that", "SUPER_ADMIN_REQUIRED");
  }
  if (action === "reset" && env.ALLOW_FACTORY_RESET !== "true") {
    throw new HttpError(403, "Factory reset is disabled on this server", "RESET_DISABLED");
  }
  if (target) {
    if (NOT_ON_SELF.has(action) && target.id === actor.id) {
      const verb = action === "set_admin" ? "change your own admin status" : `${action} yourself`;
      throw new HttpError(400, `You can’t ${verb}`, "SELF_ACTION");
    }
    if (PROTECTS_SUPER_TARGET.has(action) && target.isSuperAdmin && actor.tier !== "super") {
      throw new HttpError(403, "You can’t change the super admin", "SUPER_ADMIN_PROTECTED");
    }
  }
}
