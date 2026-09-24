import { randomBytes } from "crypto";
import { eq, and, gt, lt, sql, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import {
  normalizeUsername,
  normalizeNewUsername,
  publicDisplayName,
} from "../shared/userDisplay";
import { HttpError } from "./api/errors";

const SESSION_COOKIE = "pickems_session";
const SESSION_DAYS = 30;

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

/** Parse a Cookie header. Never throws: malformed %-encoding keeps the raw value; first occurrence wins. */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
    const rawValue = part.slice(eqIdx + 1).trim();
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      value = rawValue;
    }
    out[key] = value;
  }
  return out;
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
    isSuperAdmin: user.isSuperAdmin,
  };
}

/** Username format check → 400 instead of a generic error. */
function validUsername(raw: unknown, forNewName: boolean): string {
  const input = typeof raw === "string" ? raw : "";
  try {
    return forNewName ? normalizeNewUsername(input) : normalizeUsername(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid username";
    const code = /reserved/i.test(message) ? "RESERVED_USERNAME" : "INVALID_USERNAME";
    throw new HttpError(400, message, code);
  }
}

/** New session for this user. Other devices stay signed in; only expired sessions are pruned. */
export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.batch([
    db
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, now))),
    db.insert(schema.sessions).values({ userId, token, expiresAt }),
  ]);
  return token;
}

export async function getUserFromSession(token: string | undefined) {
  if (!token) return null;
  const db = getDb();
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.user.isBanned) return null;
  return row.user;
}

/**
 * Username-only login. Existing user → new session (stored username untouched).
 * Unknown user → 404 USER_NOT_FOUND unless `create` is true, in which case a
 * new account is made (if registration is open and the name isn't reserved).
 */
export async function registerOrLogin(username: unknown, options: { create?: boolean } = {}) {
  const db = getDb();
  const loginName = validUsername(username, false);
  const key = loginName.toLowerCase();

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) = ${key}`)
    .limit(1);

  if (existing) {
    if (existing.isBanned) throw new HttpError(403, "This account is banned", "BANNED");
    let user = existing;
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

  if (options.create !== true) {
    throw new HttpError(404, "No player with that name", "USER_NOT_FOUND");
  }

  const newName = validUsername(loginName, true);

  const [settings] = await db.select().from(schema.siteSettings).limit(1);
  if (settings && !settings.registrationOpen) {
    throw new HttpError(403, "Registration is closed", "REGISTRATION_CLOSED");
  }

  const [user] = await db
    .insert(schema.users)
    .values({ username: newName, displayName: newName })
    .onConflictDoNothing()
    .returning();
  if (!user) throw new HttpError(409, "Username already taken", "USERNAME_TAKEN");

  const token = await createSession(user.id);
  return { user, token, created: true };
}

/** Change login username if not taken by someone else (reserved names blocked). */
export async function changeUsername(userId: string, nextUsername: unknown) {
  const db = getDb();
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!current) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  if (current.isBanned) throw new HttpError(403, "This account is banned", "BANNED");

  // Re-casing your own (possibly legacy reserved) name is allowed; anything else must be a valid new name.
  const loose = validUsername(nextUsername, false);
  const loginName =
    loose.toLowerCase() === current.username.toLowerCase() ? loose : validUsername(loose, true);
  const key = loginName.toLowerCase();

  const [taken] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(sql`lower(${schema.users.username}) = ${key}`, ne(schema.users.id, userId)))
    .limit(1);
  if (taken) throw new HttpError(409, "Username already taken", "USERNAME_TAKEN");

  const prevDisplay = current.displayName?.trim() ?? "";
  const displayWasDefault =
    !prevDisplay || prevDisplay.toLowerCase() === current.username.toLowerCase();

  const [updated] = await db
    .update(schema.users)
    .set({
      username: loginName,
      ...(displayWasDefault ? { displayName: loginName } : {}),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  return updated ?? current;
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const db = getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}
