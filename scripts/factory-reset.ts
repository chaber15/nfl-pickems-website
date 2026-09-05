/**
 * One-shot factory reset against DATABASE_URL.
 *
 *   DATABASE_URL=... KEEP_ADMIN=Caleb npx tsx scripts/factory-reset.ts
 *
 * Deletes all users except KEEP_ADMIN (case-insensitive), all picks/games/weeks,
 * then syncs the current ESPN week.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../server/db";
import { factoryReset } from "../server/factoryReset";

async function main() {
  const keep = (process.env.KEEP_ADMIN ?? "").trim();
  if (!keep) {
    console.error("Set KEEP_ADMIN to your admin username, e.g. KEEP_ADMIN=Caleb");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = getDb();
  const key = keep.toLowerCase();
  const [admin] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) = ${key}`)
    .limit(1);

  if (!admin) {
    console.error(`No user found for KEEP_ADMIN=${keep}`);
    process.exit(1);
  }
  if (!admin.isAdmin) {
    await db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, admin.id));
    console.log(`Promoted ${admin.username} to admin`);
  }

  const result = await factoryReset(admin.id);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
