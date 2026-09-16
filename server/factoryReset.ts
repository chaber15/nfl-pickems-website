import { eq, ne, sql, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { syncEspnWeek } from "./espn/sync";
import { resolveCurrentPickemsWeek } from "../shared/espnClient";
import { clampToAvailableWeek } from "../shared/weekUtils";

export interface FactoryResetResult {
  deletedUsers: number;
  deletedPicks: number;
  deletedGames: number;
  deletedWeeks: number;
  deletedSeasons: number;
  keptAdminUsername: string;
  keptPreseasonGames: number;
  synced: { upserted: number; week: number; seasonType: number };
}

/**
 * Wipe beta data for a clean regular-season start.
 * Keeps the calling admin account and all preseason weeks/games.
 * Removes other users, all picks, badges, and non-preseason weeks/games.
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

  const nonPreseasonWeeks = await db
    .select({ id: schema.weeks.id })
    .from(schema.weeks)
    .where(ne(schema.weeks.phase, "preseason"));
  const nonPreseasonWeekIds = nonPreseasonWeeks.map((w) => w.id);

  let gameCount = 0;
  if (nonPreseasonWeekIds.length > 0) {
    const games = await db
      .select({ id: schema.games.id })
      .from(schema.games)
      .where(inArray(schema.games.weekId, nonPreseasonWeekIds));
    gameCount = games.length;
  }

  const [{ count: otherUsers }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(ne(schema.users.id, keepAdminUserId));

  const [{ count: preseasonGameCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(eq(schema.weeks.phase, "preseason"));

  // Delete badges, picks, sessions for everyone except keep admin user row
  try {
    await db.delete(schema.userBadges);
  } catch {
    /* user_badges may not exist until db:push */
  }
  await db.delete(schema.picks);
  await db.delete(schema.sessions).where(ne(schema.sessions.userId, keepAdminUserId));

  if (nonPreseasonWeekIds.length > 0) {
    await db.delete(schema.games).where(inArray(schema.games.weekId, nonPreseasonWeekIds));
    await db.delete(schema.weeks).where(inArray(schema.weeks.id, nonPreseasonWeekIds));
  }

  // Drop seasons that no longer have any weeks
  const remainingWeeks = await db.select({ seasonId: schema.weeks.seasonId }).from(schema.weeks);
  const keepSeasonIds = new Set(remainingWeeks.map((w) => w.seasonId));
  const allSeasons = await db.select().from(schema.seasons);
  const seasonsToDelete = allSeasons.filter((s) => !keepSeasonIds.has(s.id)).map((s) => s.id);
  let deletedSeasons = 0;
  if (seasonsToDelete.length > 0) {
    await db
      .update(schema.siteSettings)
      .set({ currentSeasonId: null })
      .where(eq(schema.siteSettings.id, 1));
    await db.delete(schema.seasons).where(inArray(schema.seasons.id, seasonsToDelete));
    deletedSeasons = seasonsToDelete.length;
  }

  await db.delete(schema.users).where(ne(schema.users.id, keepAdminUserId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, keepAdminUserId));

  await db
    .update(schema.siteSettings)
    .set({ registrationOpen: true })
    .where(eq(schema.siteSettings.id, 1));

  const current = await resolveCurrentPickemsWeek();
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
    deletedWeeks: nonPreseasonWeekIds.length,
    deletedSeasons,
    keptAdminUsername: admin.username,
    keptPreseasonGames: preseasonGameCount,
    synced: {
      upserted: synced.upserted,
      week: synced.week,
      seasonType: synced.seasonType,
    },
  };
}
