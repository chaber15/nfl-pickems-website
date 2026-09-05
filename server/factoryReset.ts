import { eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { syncEspnWeek } from "./espn/sync";
import { detectCurrentWeek } from "../shared/espnClient";
import { clampToAvailableWeek } from "../shared/weekUtils";

export interface FactoryResetResult {
  deletedUsers: number;
  deletedPicks: number;
  deletedGames: number;
  deletedWeeks: number;
  deletedSeasons: number;
  keptAdminUsername: string;
  synced: { upserted: number; week: number; seasonType: number };
}

/**
 * Wipe beta data for a clean season start.
 * Keeps the calling admin account; removes every other user, all picks,
 * and all season/week/game rows, then syncs the current ESPN slate.
 */
export async function factoryReset(keepAdminUserId: string): Promise<FactoryResetResult> {
  const db = getDb();

  const [admin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, keepAdminUserId))
    .limit(1);
  if (!admin?.isAdmin) {
    throw new Error("Factory reset requires an admin account");
  }

  const [{ count: pickCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.picks);
  const [{ count: gameCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.games);
  const [{ count: weekCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.weeks);
  const [{ count: seasonCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.seasons);
  const [{ count: otherUsers }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(ne(schema.users.id, keepAdminUserId));

  // Break season FK on settings before wiping seasons
  await db
    .update(schema.siteSettings)
    .set({ currentSeasonId: null, registrationOpen: true })
    .where(eq(schema.siteSettings.id, 1));

  await db.delete(schema.picks);
  await db.delete(schema.sessions).where(ne(schema.sessions.userId, keepAdminUserId));
  await db.delete(schema.games);
  await db.delete(schema.weeks);
  await db.delete(schema.seasons);
  await db.delete(schema.users).where(ne(schema.users.id, keepAdminUserId));

  // Clear leftover admin sessions so they re-login cleanly after deploy if needed
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, keepAdminUserId));

  const current = await detectCurrentWeek();
  const clamped = clampToAvailableWeek(current.seasonType, current.week);
  const synced = await syncEspnWeek(clamped.seasonType, clamped.week);

  const [settings] = await db.select().from(schema.siteSettings).limit(1);
  if (!settings) {
    await db.insert(schema.siteSettings).values({ registrationOpen: true });
  }

  return {
    deletedUsers: otherUsers,
    deletedPicks: pickCount,
    deletedGames: gameCount,
    deletedWeeks: weekCount,
    deletedSeasons: seasonCount,
    keptAdminUsername: admin.username,
    synced: {
      upserted: synced.upserted,
      week: synced.week,
      seasonType: synced.seasonType,
    },
  };
}
