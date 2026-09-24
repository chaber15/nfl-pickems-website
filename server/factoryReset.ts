import { eq, ne, sql, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
 * Keeps the calling admin account (and its session) and all preseason weeks/games.
 * Removes other users, all picks, badges, and non-preseason weeks/games.
 *
 * All deletes run in one db.batch (a single transaction on neon-http), so a
 * failure part-way leaves the data untouched. The ESPN re-sync runs after.
 * Callers gate this behind the super tier + ALLOW_FACTORY_RESET=true.
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

  const [[{ count: pickCount }], allWeeks, [{ count: otherUsers }], allSeasons] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(schema.picks),
    db.select({ id: schema.weeks.id, seasonId: schema.weeks.seasonId, phase: schema.weeks.phase }).from(schema.weeks),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(ne(schema.users.id, keepAdminUserId)),
    db.select({ id: schema.seasons.id }).from(schema.seasons),
  ]);

  const nonPreseasonWeekIds = allWeeks.filter((w) => w.phase !== "preseason").map((w) => w.id);
  const preseasonWeekIds = allWeeks.filter((w) => w.phase === "preseason").map((w) => w.id);
  const keepSeasonIds = new Set(
    allWeeks.filter((w) => w.phase === "preseason").map((w) => w.seasonId),
  );
  const seasonsToDelete = allSeasons.filter((s) => !keepSeasonIds.has(s.id)).map((s) => s.id);

  const [gameCount, preseasonGameCount] = await Promise.all([
    countGamesInWeeks(nonPreseasonWeekIds),
    countGamesInWeeks(preseasonWeekIds),
  ]);

  const ops: BatchItem<"pg">[] = [
    db.delete(schema.userBadges),
    db.delete(schema.picks),
    db.delete(schema.sessions).where(ne(schema.sessions.userId, keepAdminUserId)),
  ];
  if (nonPreseasonWeekIds.length > 0) {
    ops.push(db.delete(schema.games).where(inArray(schema.games.weekId, nonPreseasonWeekIds)));
    ops.push(db.delete(schema.weeks).where(inArray(schema.weeks.id, nonPreseasonWeekIds)));
  }
  if (seasonsToDelete.length > 0) {
    ops.push(
      db
        .update(schema.siteSettings)
        .set({ currentSeasonId: null })
        .where(eq(schema.siteSettings.id, 1)),
    );
    ops.push(db.delete(schema.seasons).where(inArray(schema.seasons.id, seasonsToDelete)));
  }
  ops.push(db.delete(schema.users).where(ne(schema.users.id, keepAdminUserId)));
  ops.push(
    db
      .insert(schema.siteSettings)
      .values({ id: 1, registrationOpen: true })
      .onConflictDoUpdate({ target: schema.siteSettings.id, set: { registrationOpen: true } }),
  );

  await db.batch(ops as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  const current = await resolveCurrentPickemsWeek();
  const clamped = clampToAvailableWeek(current.seasonType, current.week);
  const synced = await syncEspnWeek(clamped.seasonType, clamped.week);

  return {
    deletedUsers: otherUsers,
    deletedPicks: pickCount,
    deletedGames: gameCount,
    deletedWeeks: nonPreseasonWeekIds.length,
    deletedSeasons: seasonsToDelete.length,
    keptAdminUsername: admin.username,
    keptPreseasonGames: preseasonGameCount,
    synced: {
      upserted: synced.upserted,
      week: synced.week,
      seasonType: synced.seasonType,
    },
  };
}

async function countGamesInWeeks(weekIds: string[]): Promise<number> {
  if (weekIds.length === 0) return 0;
  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.games)
    .where(inArray(schema.games.weekId, weekIds));
  return count;
}
