import { eq, or } from "drizzle-orm";
import { getDb, schema } from "./db";
import { recordUnlockFailure, type UnlockAttempt } from "./adminAuth";

/**
 * DB side of the admin-unlock lockout (decisions live in adminAuth.ts). Fails open: if the
 * table is missing or the query fails, unlock behaves as before (1 s delay per wrong
 * passphrase) rather than locking the commissioner out of Admin.
 */
export type UnlockAttempts = { user: UnlockAttempt | null; ip: UnlockAttempt | null };

const NONE: UnlockAttempts = { user: null, ip: null };

const toAttempt = (r: typeof schema.adminUnlockAttempts.$inferSelect): UnlockAttempt => ({
  windowStart: r.windowStart,
  failures: r.failures,
  lockedUntil: r.lockedUntil,
});

export async function loadUnlockAttempts(userId: string, ip: string | null): Promise<UnlockAttempts> {
  const t = schema.adminUnlockAttempts;
  try {
    const rows = await getDb()
      .select()
      .from(t)
      .where(ip ? or(eq(t.userId, userId), eq(t.ip, ip)) : eq(t.userId, userId));
    const user = rows.find((r) => r.userId === userId);
    const byIp = ip ? rows.find((r) => r.ip === ip) : undefined;
    return { user: user ? toAttempt(user) : null, ip: byIp ? toAttempt(byIp) : null };
  } catch (err) {
    console.error("[admin] unlock attempts unavailable (lockout off):", err);
    return NONE;
  }
}

export async function saveUnlockFailure(
  userId: string,
  ip: string | null,
  prev: UnlockAttempts,
  now: Date,
): Promise<void> {
  const db = getDb();
  const t = schema.adminUnlockAttempts;
  const user = recordUnlockFailure(prev.user, now);
  const writes = [
    db.insert(t).values({ userId, ...user }).onConflictDoUpdate({ target: t.userId, set: user }),
  ];
  if (ip) {
    const byIp = recordUnlockFailure(prev.ip, now);
    writes.push(db.insert(t).values({ ip, ...byIp }).onConflictDoUpdate({ target: t.ip, set: byIp }));
  }
  try {
    await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
  } catch (err) {
    console.error("[admin] couldn't record unlock failure:", err);
  }
}

export async function clearUnlockAttempts(userId: string, ip: string | null): Promise<void> {
  const t = schema.adminUnlockAttempts;
  try {
    await getDb()
      .delete(t)
      .where(ip ? or(eq(t.userId, userId), eq(t.ip, ip)) : eq(t.userId, userId));
  } catch (err) {
    console.error("[admin] couldn't clear unlock attempts:", err);
  }
}
