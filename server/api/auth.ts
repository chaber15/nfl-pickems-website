import type { HandlerEvent } from "@netlify/functions";
import {
  parseCookies,
  buildSessionCookie,
  clearSessionCookie,
  getSessionCookieName,
  getUserFromSession,
  registerOrLogin,
  changeUsername,
  logout,
  toPublicUser,
} from "../auth";
import { json, isSecure } from "./http";

export async function handleAuth(path: string, event: HandlerEvent) {
  const secure = isSecure(event);
  const cookies = parseCookies(event.headers.cookie ?? null);
  const token = cookies[getSessionCookieName()];

  if (path === "auth/me" && event.httpMethod === "GET") {
    const user = await getUserFromSession(token);
    return json(200, {
      user: user ? toPublicUser(user) : null,
    });
  }

  if (path === "auth/login" && event.httpMethod === "POST") {
    const body = JSON.parse(event.body ?? "{}") as { username?: string };
    const { user, token: newToken, created } = await registerOrLogin(body.username ?? "");
    return json(
      200,
      { user: toPublicUser(user), created },
      { "Set-Cookie": buildSessionCookie(newToken, secure) },
    );
  }

  if (path === "auth/logout" && event.httpMethod === "POST") {
    await logout(token);
    return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie(secure) });
  }

  if (path === "auth/username" && event.httpMethod === "POST") {
    const user = await getUserFromSession(token);
    if (!user) return json(401, { error: "Unauthorized" });
    const body = JSON.parse(event.body ?? "{}") as { username?: string };
    const updated = await changeUsername(user.id, body.username ?? "");
    return json(200, { user: toPublicUser(updated) });
  }

  return json(404, { error: "Not found" });
}
