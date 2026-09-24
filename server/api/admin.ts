import type { HandlerEvent } from "@netlify/functions";
import { eq, ne } from "drizzle-orm";
import { getDb, schema } from "../db";
import { syncEspnWeek } from "../espn/sync";
import { factoryReset } from "../factoryReset";
import { changeUsername, toPublicUser } from "../auth";
import {
  assertAdminPermission,
  buildUnlockCookies,
  clearAdminCookies,
  evaluateUnlock,
  isAdminAction,
  resolveAdminTier,
  type AdminAction,
  type AdminTier,
} from "../adminAuth";
import { normalizeDisplayName, publicDisplayName } from "../../shared/userDisplay";
import { BADGE_CATALOG, isDisplayableBadgeAward } from "../../shared/badges";
import { allBadgeRows } from "../badges";
import { HttpError } from "./errors";
import { getCookies, isSecure, isUuid, json, parseJsonBody, requireUser } from "./http";
import { isValidWeekParams } from "./policy";

const BAD_PIN_DELAY_MS = 1000;

/** Overridable in tests. */
export const adminTiming = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

function isFactoryResetEnabled(): boolean {
  return process.env.ALLOW_FACTORY_RESET === "true";
}

/** Optional { seasonType, week } in a body: both absent, or a valid pick'ems week. */
function optionalWeek(body: Record<string, unknown>): { seasonType?: number; week?: number } {
  const seasonType = body.seasonType ?? undefined;
  const week = body.week ?? undefined;
  if (seasonType === undefined && week === undefined) return {};
  const st = seasonType ?? 2;
  if (typeof st !== "number" || typeof week !== "number" || !isValidWeekParams(st, week)) {
    throw new HttpError(400, "Invalid week", "INVALID_WEEK");
  }
  return { seasonType: st, week };
}

export async function handleAdmin(path: string, event: HandlerEvent) {
  const secure = isSecure(event);

  if (path === "admin/lock" && event.httpMethod === "POST") {
    return json(200, { ok: true }, {}, clearAdminCookies(secure));
  }

  const { user, token } = await requireUser(event);
  if (!user.isAdmin) throw new HttpError(403, "Admins only", "FORBIDDEN");

  if (path === "admin/unlock" && event.httpMethod === "POST") {
    const body = parseJsonBody(event);
    const result = evaluateUnlock(user, body.pin);
    if (!result.ok) {
      if (result.code === "BAD_PIN") await adminTiming.sleep(BAD_PIN_DELAY_MS);
      throw new HttpError(result.status, result.error, result.code);
    }
    return json(
      200,
      { ok: true, tier: result.tier },
      {},
      buildUnlockCookies(result.tier, token, secure),
    );
  }

  const tier = resolveAdminTier(user, token, getCookies(event));
  if (!tier) throw new HttpError(403, "Admin tools are locked", "ADMIN_LOCKED");

  const db = getDb();
  const actor = { id: user.id, tier };
  const allow = (action: AdminAction, target: { id: string; isSuperAdmin: boolean } | null = null) =>
    assertAdminPermission(action, actor, target);

  if (path === "admin/sync" && event.httpMethod === "POST") {
    allow("sync");
    const { seasonType, week } = optionalWeek(parseJsonBody(event));
    const result = await syncEspnWeek(seasonType, week);
    return json(200, result);
  }

  if (path === "admin/badges" && event.httpMethod === "POST") {
    allow("badges");
    const body = parseJsonBody(event);
    const { seasonType, week } = optionalWeek(body);
    const { refreshBadges, reconcileLifetimeThresholdBadges } = await import("../badges");
    if (body.reconcileOnly === true) {
      const lifetime = await reconcileLifetimeThresholdBadges();
      return json(200, { weeks: [], totalAwarded: lifetime.granted, lifetime });
    }
    const result = await refreshBadges({
      seasonType,
      week,
      allCompleted: body.allCompleted === true,
    });
    return json(200, result);
  }

  if (path === "admin/reset" && event.httpMethod === "POST") {
    allow("reset");
    const body = parseJsonBody(event);
    if (body.confirm !== "RESET") {
      throw new HttpError(400, "Type RESET to confirm factory reset", "CONFIRM_REQUIRED");
    }
    const result = await factoryReset(user.id);
    return json(200, result);
  }

  if (path !== "admin") return json(404, { error: "Not found", code: "NOT_FOUND" });

  if (event.httpMethod === "GET") {
    return json(200, await adminOverview(user.id, tier));
  }

  if (event.httpMethod !== "POST") return json(404, { error: "Not found", code: "NOT_FOUND" });

  const body = parseJsonBody(event);
  const action = body.action;
  if (!isAdminAction(action) || action === "sync" || action === "badges" || action === "reset") {
    throw new HttpError(400, "Invalid action", "INVALID_ACTION");
  }

  if (action === "registration") {
    allow("registration");
    if (typeof body.registrationOpen !== "boolean") {
      throw new HttpError(400, "registrationOpen must be true or false", "INVALID_REQUEST");
    }
    await db
      .insert(schema.siteSettings)
      .values({ id: 1, registrationOpen: body.registrationOpen })
      .onConflictDoUpdate({
        target: schema.siteSettings.id,
        set: { registrationOpen: body.registrationOpen },
      });
    return json(200, { ok: true });
  }

  // Every remaining action targets a user.
  if (!isUuid(body.userId)) throw new HttpError(400, "Invalid userId", "INVALID_REQUEST");
  const targetId = body.userId;
  const [target] = await db
    .select({ id: schema.users.id, isSuperAdmin: schema.users.isSuperAdmin })
    .from(schema.users)
    .where(eq(schema.users.id, targetId))
    .limit(1);
  if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  allow(action, target);

  if (action === "ban") {
    // Kick any open sessions so they can’t keep using the site.
    await db.batch([
      db.update(schema.users).set({ isBanned: true }).where(eq(schema.users.id, targetId)),
      db.delete(schema.sessions).where(eq(schema.sessions.userId, targetId)),
    ]);
    return json(200, { ok: true });
  }

  if (action === "unban") {
    await db.update(schema.users).set({ isBanned: false }).where(eq(schema.users.id, targetId));
    return json(200, { ok: true });
  }

  if (action === "delete") {
    // Cascades to picks, sessions and badges via FK.
    await db.delete(schema.users).where(eq(schema.users.id, targetId));
    return json(200, { ok: true });
  }

  if (action === "set_admin") {
    if (typeof body.isAdmin !== "boolean") {
      throw new HttpError(400, "isAdmin must be true or false", "INVALID_REQUEST");
    }
    await db.update(schema.users).set({ isAdmin: body.isAdmin }).where(eq(schema.users.id, targetId));
    return json(200, { ok: true });
  }

  if (action === "set_display_name") {
    if (typeof body.displayName !== "string") {
      throw new HttpError(400, "displayName required", "INVALID_REQUEST");
    }
    let displayName: string | null;
    try {
      displayName = normalizeDisplayName(body.displayName);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "Invalid display name", "INVALID_DISPLAY_NAME");
    }
    const [updated] = await db
      .update(schema.users)
      .set({ displayName })
      .where(eq(schema.users.id, targetId))
      .returning();
    if (!updated) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    return json(200, { ok: true, displayName: publicDisplayName(updated) });
  }

  if (action === "set_username") {
    if (typeof body.username !== "string") {
      throw new HttpError(400, "username required", "INVALID_REQUEST");
    }
    const updated = await changeUsername(targetId, body.username);
    return json(200, { ok: true, user: toPublicUser(updated) });
  }

  throw new HttpError(400, "Invalid action", "INVALID_ACTION");
}

async function adminOverview(selfId: string, tier: AdminTier) {
  const db = getDb();
  const [users, [settings], earned] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        isBanned: schema.users.isBanned,
        isAdmin: schema.users.isAdmin,
        isSuperAdmin: schema.users.isSuperAdmin,
      })
      .from(schema.users)
      .where(ne(schema.users.id, selfId)),
    db.select().from(schema.siteSettings).limit(1),
    allBadgeRows(),
  ]);
  const earnedByBadge = new Map<string, number>();
  for (const e of earned) {
    if (!isDisplayableBadgeAward(e.badgeId, e.weekNumber)) continue;
    earnedByBadge.set(e.badgeId, (earnedByBadge.get(e.badgeId) ?? 0) + 1);
  }
  return {
    users: users.map((u) => ({
      ...u,
      displayName: publicDisplayName(u),
    })),
    registrationOpen: settings?.registrationOpen ?? true,
    tier,
    factoryResetEnabled: isFactoryResetEnabled(),
    badgeCatalog: BADGE_CATALOG.map((b) => ({
      ...b,
      timesEarned: earnedByBadge.get(b.id) ?? 0,
    })),
  };
}
