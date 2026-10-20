import type { HandlerEvent } from "@netlify/functions";
import {
  buildSessionCookie,
  clearSessionCookie,
  getUserFromSession,
  registerOrLogin,
  changeUsername,
  logout,
  toPublicUser,
} from "../auth";
import { clearAdminCookies, resolveAdminTier } from "../adminAuth";
import { HttpError } from "./errors";
import { json, isSecure, getCookies, getSessionToken, parseJsonBody } from "./http";

export async function handleAuth(path: string, event: HandlerEvent) {
  const secure = isSecure(event);
  const token = getSessionToken(event);

  if (path === "auth/me" && event.httpMethod === "GET") {
    const user = await getUserFromSession(token);
    return json(200, {
      user: user ? toPublicUser(user) : null,
    });
  }

  if (path === "auth/login" && event.httpMethod === "POST") {
    const body = parseJsonBody(event);
    const { user, token: newToken, created } = await registerOrLogin(body.username, {
      create: body.create === true,
    });
    return json(200, { user: toPublicUser(user), created }, {}, [
      buildSessionCookie(newToken, secure),
      // A new session never inherits a previous admin unlock on this browser.
      ...clearAdminCookies(secure),
    ]);
  }

  if (path === "auth/logout" && event.httpMethod === "POST") {
    await logout(token);
    return json(200, { ok: true }, {}, [clearSessionCookie(secure), ...clearAdminCookies(secure)]);
  }

  if (path === "auth/username" && event.httpMethod === "POST") {
    const user = await getUserFromSession(token);
    if (!user) throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
    // Login is username-only, so anyone who knows an admin's name could otherwise rename the
    // account out from under them. Renaming an admin needs that browser's Admin unlock.
    if (user.isAdmin && !resolveAdminTier(user, token, getCookies(event))) {
      throw new HttpError(403, "Unlock Admin (with the admin passphrase) to change an admin's username", "ADMIN_LOCKED");
    }
    const body = parseJsonBody(event);
    const updated = await changeUsername(user.id, body.username);
    return json(200, { user: toPublicUser(updated) });
  }

  return json(404, { error: "Not found", code: "NOT_FOUND" });
}
