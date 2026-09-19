import type { HandlerEvent } from "@netlify/functions";
import {
  parseCookies,
  getSessionCookieName,
  getUserFromSession,
} from "../auth";

export function json(statusCode: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

export function isSecure(event: HandlerEvent) {
  return event.headers["x-forwarded-proto"] === "https";
}

export async function requireUser(event: HandlerEvent) {
  const cookies = parseCookies(event.headers.cookie ?? null);
  const token = cookies[getSessionCookieName()];
  const user = await getUserFromSession(token);
  if (!user) throw new Error("Unauthorized");
  return { user, token };
}
