import type { HandlerEvent } from "@netlify/functions";
import {
  parseCookies,
  getSessionCookieName,
  getUserFromSession,
} from "../auth";
import { HttpError } from "./errors";

export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: string;
}

/**
 * JSON response. `cookies` become multiple Set-Cookie headers (Netlify/Lambda
 * multiValueHeaders). Cache-Control is added centrally by the router.
 */
export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
  cookies: string[] = [],
): ApiResponse {
  const res: ApiResponse = {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
  if (cookies.length > 0) res.multiValueHeaders = { "Set-Cookie": cookies };
  return res;
}

/** Case-insensitive header lookup. */
export function getHeader(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (direct !== undefined) return direct;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export function isSecure(event: HandlerEvent) {
  return getHeader(event.headers, "x-forwarded-proto") === "https";
}

export function getCookies(event: HandlerEvent): Record<string, string> {
  return parseCookies(getHeader(event.headers, "cookie") ?? null);
}

export function getSessionToken(event: HandlerEvent): string | undefined {
  return getCookies(event)[getSessionCookieName()];
}

export async function requireUser(event: HandlerEvent) {
  const token = getSessionToken(event);
  const user = await getUserFromSession(token);
  if (!user || !token) throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
  return { user, token };
}

/** Parse a JSON object body; malformed or non-object → 400 "Invalid request". */
export function parseJsonBody(event: HandlerEvent): Record<string, unknown> {
  const raw = event.body ?? "";
  if (raw.trim() === "") return {};
  let parsed: unknown;
  try {
    const text = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid request", "INVALID_REQUEST");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Invalid request", "INVALID_REQUEST");
  }
  return parsed as Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
