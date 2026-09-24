import { HttpError } from "./errors";

/** Public, CDN-cacheable read endpoints (no per-user data). */
const PUBLIC_CACHEABLE_PATHS = new Set(["games", "calendar", "calendar/current"]);

export const PUBLIC_CDN_CACHE = "public, s-maxage=60, stale-while-revalidate=120";
export const PUBLIC_BROWSER_CACHE = "public, max-age=0, must-revalidate";
export const PRIVATE_NO_STORE = "private, no-store";

/**
 * Cache headers for a response. Only successful GETs of the public slate
 * endpoints are cacheable (Netlify CDN, 60s); everything else is private.
 */
export function cacheHeadersFor(
  path: string,
  method: string,
  statusCode: number,
): Record<string, string> {
  if (method === "GET" && statusCode === 200 && PUBLIC_CACHEABLE_PATHS.has(path)) {
    return {
      "Cache-Control": PUBLIC_BROWSER_CACHE,
      "Netlify-CDN-Cache-Control": PUBLIC_CDN_CACHE,
    };
  }
  return { "Cache-Control": PRIVATE_NO_STORE };
}

/**
 * CSRF defense in depth: a POST carrying an Origin header must come from the
 * same host. Requests without Origin (curl, same-origin older browsers) pass;
 * SameSite=Lax cookies already cover those.
 */
export function isOriginAllowed(
  method: string,
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (method !== "POST") return true;
  if (origin === undefined || origin === "") return true;
  if (!host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost.toLowerCase() === host.trim().toLowerCase();
}

/**
 * Is (seasonType, week) a week this site runs pick'ems for?
 * Regular season (2): weeks 1–18. Postseason (3): weeks 1–5.
 * TODO(merge): use isValidPickemsWeek from shared/weekUtils (Agent A).
 */
export function isValidWeekParams(seasonType: number, week: number): boolean {
  if (!Number.isInteger(seasonType) || !Number.isInteger(week)) return false;
  if (seasonType === 2) return week >= 1 && week <= 18;
  if (seasonType === 3) return week >= 1 && week <= 5;
  return false;
}

/** Parse + validate ?seasonType=&week= (defaults 2 / 1). Invalid → 400. */
export function parseWeekQuery(params: Record<string, string | undefined>): {
  seasonType: number;
  week: number;
} {
  const rawType = params.seasonType;
  const rawWeek = params.week;
  const seasonType = rawType === undefined || rawType === "" ? 2 : Number(rawType);
  const week = rawWeek === undefined || rawWeek === "" ? 1 : Number(rawWeek);
  const intLike = (s: string | undefined) => s === undefined || s === "" || /^\d+$/.test(s.trim());
  if (!intLike(rawType) || !intLike(rawWeek) || !isValidWeekParams(seasonType, week)) {
    throw new HttpError(400, "Invalid week", "INVALID_WEEK");
  }
  return { seasonType, week };
}
