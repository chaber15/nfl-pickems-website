import type { HandlerEvent } from "@netlify/functions";
import { eq, ne } from "drizzle-orm";
import { getDb, schema } from "../db";
import { syncEspnWeek } from "../espn/sync";
import { factoryReset } from "../factoryReset";
import { changeUsername, toPublicUser } from "../auth";
import { normalizeDisplayName, publicDisplayName } from "../../shared/userDisplay";
import { BADGE_CATALOG, isDisplayableBadgeAward } from "../../shared/badges";
import { allBadgeRows } from "../badges";
import { json, requireUser } from "./http";

export async function handleAdmin(path: string, event: HandlerEvent) {
  const { user } = await requireUser(event);
  if (!user.isAdmin) return json(403, { error: "Admin only" });
  const db = getDb();

  if (path === "admin/sync" && event.httpMethod === "POST") {
    const body = JSON.parse(event.body ?? "{}") as { seasonType?: number; week?: number };
    const result = await syncEspnWeek(body.seasonType, body.week);
    return json(200, result);
  }

  if (path === "admin/badges" && event.httpMethod === "POST") {
    const body = JSON.parse(event.body ?? "{}") as {
      seasonType?: number;
      week?: number;
      allCompleted?: boolean;
      reconcileOnly?: boolean;
    };
    const { refreshBadges, reconcileLifetimeThresholdBadges } = await import("../badges");
    if (body.reconcileOnly === true) {
      const lifetime = await reconcileLifetimeThresholdBadges();
      return json(200, { weeks: [], totalAwarded: lifetime.granted, lifetime });
    }
    const result = await refreshBadges({
      seasonType: body.seasonType,
      week: body.week,
      allCompleted: body.allCompleted === true,
    });
    return json(200, result);
  }

  if (path === "admin/reset" && event.httpMethod === "POST") {
    const body = JSON.parse(event.body ?? "{}") as { confirm?: string };
    if (body.confirm !== "RESET") {
      return json(400, { error: "Type RESET to confirm factory reset" });
    }
    const result = await factoryReset(user.id);
    return json(200, result);
  }

  if (event.httpMethod === "GET") {
    const users = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        isBanned: schema.users.isBanned,
        isAdmin: schema.users.isAdmin,
      })
      .from(schema.users)
      .where(ne(schema.users.id, user.id));
    const [settings] = await db.select().from(schema.siteSettings).limit(1);
    const earned = await allBadgeRows();
    const earnedByBadge = new Map<string, number>();
    for (const e of earned) {
      if (!isDisplayableBadgeAward(e.badgeId, e.weekNumber)) continue;
      earnedByBadge.set(e.badgeId, (earnedByBadge.get(e.badgeId) ?? 0) + 1);
    }
    return json(200, {
      users: users.map((u) => ({
        ...u,
        displayName: publicDisplayName(u),
      })),
      registrationOpen: settings?.registrationOpen ?? true,
      badgeCatalog: BADGE_CATALOG.map((b) => ({
        ...b,
        timesEarned: earnedByBadge.get(b.id) ?? 0,
      })),
    });
  }

  const body = JSON.parse(event.body ?? "{}") as {
    action?: string;
    userId?: string;
    registrationOpen?: boolean;
    isAdmin?: boolean;
    displayName?: string;
    username?: string;
  };

  if (body.action === "ban" && body.userId) {
    if (body.userId === user.id) {
      return json(400, { error: "You can’t ban yourself" });
    }
    await db.update(schema.users).set({ isBanned: true }).where(eq(schema.users.id, body.userId));
    // Kick any open sessions so they can’t keep using the site
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, body.userId));
    return json(200, { ok: true });
  }

  if (body.action === "unban" && body.userId) {
    await db.update(schema.users).set({ isBanned: false }).where(eq(schema.users.id, body.userId));
    return json(200, { ok: true });
  }

  if (body.action === "delete" && body.userId) {
    if (body.userId === user.id) {
      return json(400, { error: "You can’t delete yourself" });
    }
    // Cascades to picks + sessions via FK
    await db.delete(schema.users).where(eq(schema.users.id, body.userId));
    return json(200, { ok: true });
  }

  if (body.action === "set_admin" && body.userId && typeof body.isAdmin === "boolean") {
    if (body.userId === user.id) {
      return json(400, { error: "You can’t change your own admin status" });
    }
    await db
      .update(schema.users)
      .set({ isAdmin: body.isAdmin })
      .where(eq(schema.users.id, body.userId));
    return json(200, { ok: true });
  }

  if (body.action === "set_display_name" && body.userId && typeof body.displayName === "string") {
    const displayName = normalizeDisplayName(body.displayName);
    const [updated] = await db
      .update(schema.users)
      .set({ displayName })
      .where(eq(schema.users.id, body.userId))
      .returning();
    if (!updated) return json(404, { error: "User not found" });
    return json(200, { ok: true, displayName: publicDisplayName(updated) });
  }

  if (body.action === "set_username" && body.userId && typeof body.username === "string") {
    const updated = await changeUsername(body.userId, body.username);
    return json(200, { ok: true, user: toPublicUser(updated) });
  }

  if (body.action === "registration" && typeof body.registrationOpen === "boolean") {
    const [settings] = await db.select().from(schema.siteSettings).limit(1);
    if (!settings) {
      await db.insert(schema.siteSettings).values({ registrationOpen: body.registrationOpen });
    } else {
      await db
        .update(schema.siteSettings)
        .set({ registrationOpen: body.registrationOpen })
        .where(eq(schema.siteSettings.id, 1));
    }
    return json(200, { ok: true });
  }

  return json(400, { error: "Invalid action" });
}
