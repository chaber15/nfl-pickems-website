import { randomBytes } from "crypto";
import { eq, and, gt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { publicDisplayName } from "../shared/userDisplay";

const SESSION_COOKIE = "pickems_session";
const SESSION_DAYS = 30;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    }),
  );
}

export function buildSessionCookie(token: string, secure: boolean): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function toPublicUser(user: typeof schema.users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: publicDisplayName(user),
    isAdmin: user.isAdmin,
  };
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ userId, token, expiresAt });
  return token;
}

export async function getUserFromSession(token: string | undefined) {
  if (!token) return null;
  const db = getDb();
  const now = new Date();
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, now)))
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
  if (!user || user.isBanned) return null;
  return user;
}

export async function registerOrLogin(username: string) {
  const db = getDb();
  const loginName = username.trim();
  if (!USERNAME_RE.test(loginName)) {
    throw new Error("Username must be 3-20 chars: letters, numbers, underscore");
  }
  const key = loginName.toLowerCase();

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) = ${key}`)
    .limit(1);

  if (existing) {
    if (existing.isBanned) throw new Error("Account banned");
    let user = existing;
    if (existing.username !== loginName) {
      const [updated] = await db
        .update(schema.users)
        .set({ username: loginName })
        .where(eq(schema.users.id, existing.id))
        .returning();
      user = updated ?? existing;
    }
    if (!user.displayName?.trim()) {
      const [updated] = await db
        .update(schema.users)
        .set({ displayName: user.username })
        .where(eq(schema.users.id, user.id))
        .returning();
      user = updated ?? user;
    }
    const token = await createSession(user.id);
    return { user, token, created: false };
  }

  const [settings] = await db.select().from(schema.siteSettings).limit(1);
  if (settings && !settings.registrationOpen) {
    throw new Error("Registration is closed");
  }

  const adminUsernames = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const [user] = await db
    .insert(schema.users)
    .values({
      username: loginName,
      displayName: loginName,
      isAdmin: adminUsernames.includes(key),
    })
    .returning();

  const token = await createSession(user.id);
  return { user, token, created: true };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const db = getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}
