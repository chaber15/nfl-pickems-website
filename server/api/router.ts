import type { HandlerEvent } from "@netlify/functions";
import { hasDatabase } from "../db";
import { errorToResponse } from "./errors";
import { getHeader, json, requireUser, type ApiResponse } from "./http";
import { cacheHeadersFor, isOriginAllowed } from "./policy";
import { handleAuth } from "./auth";
import { handleGames, handleCalendar } from "./games";
import { handlePicks, handleUserPicks, handleWeekPicks } from "./picks";
import { handleLeaderboard } from "./leaderboard";
import { handleHistory, handleStats } from "./history";
import { handleAdmin } from "./admin";

export function apiPath(event: Pick<HandlerEvent, "path" | "queryStringParameters">): string {
  const rawPath = event.path
    .replace(/^\/\.netlify\/functions\/api\/?/, "")
    .replace(/^\/api\/?/, "")
    .replace(/\/$/, "");
  return rawPath || (event.queryStringParameters?.path ?? "");
}

async function dispatch(path: string, event: HandlerEvent): Promise<ApiResponse> {
  if (path === "games" && event.httpMethod === "GET") return await handleGames(event);
  if (path.startsWith("calendar")) return await handleCalendar(path, event);

  if (!hasDatabase()) {
    return json(503, {
      error: "Database not configured",
      code: "DB_NOT_CONFIGURED",
    });
  }

  if (path.startsWith("auth")) return await handleAuth(path, event);
  if (path === "picks/week" && event.httpMethod === "GET") return await handleWeekPicks(event);
  if (path === "picks") {
    if (event.httpMethod === "GET") return await handleUserPicks(event);
    if (event.httpMethod === "POST") return await handlePicks(event);
  }
  if (path === "leaderboard" && event.httpMethod === "GET") {
    await requireUser(event);
    return await handleLeaderboard(event);
  }
  if (path === "history" && event.httpMethod === "GET") {
    return await handleHistory(event);
  }
  if (path === "stats" && event.httpMethod === "GET") {
    return await handleStats(event);
  }
  if (path.startsWith("admin")) return await handleAdmin(path, event);

  return json(404, { error: "Not found", code: "NOT_FOUND" });
}

export async function routeApiRequest(event: HandlerEvent): Promise<ApiResponse> {
  const path = apiPath(event);
  let response: ApiResponse;
  try {
    const origin = getHeader(event.headers, "origin");
    const host = getHeader(event.headers, "host");
    if (!isOriginAllowed(event.httpMethod, origin, host)) {
      response = json(403, { error: "Forbidden", code: "BAD_ORIGIN" });
    } else {
      response = await dispatch(path, event);
    }
  } catch (err) {
    const { status, body } = errorToResponse(err);
    response = json(status, body);
  }
  return {
    ...response,
    headers: {
      ...response.headers,
      ...cacheHeadersFor(path, event.httpMethod, response.statusCode),
    },
  };
}

