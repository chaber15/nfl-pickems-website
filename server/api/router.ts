import type { HandlerEvent } from "@netlify/functions";
import { hasDatabase } from "../db";
import { syncScheduledSlates } from "../espn/sync";
import { json } from "./http";
import { handleAuth } from "./auth";
import { handleGames, handleCalendar } from "./games";
import { handlePicks, handleUserPicks, handleWeekPicks } from "./picks";
import { handleLeaderboard } from "./leaderboard";
import { handleHistory, handleStats } from "./history";
import { handleAdmin } from "./admin";

export async function routeApiRequest(event: HandlerEvent) {
  try {
    const rawPath = event.path
      .replace(/^\/\.netlify\/functions\/api\/?/, "")
      .replace(/^\/api\/?/, "")
      .replace(/\/$/, "");
    const path = rawPath || (event.queryStringParameters?.path ?? "");

    if (path === "games" && event.httpMethod === "GET") return await handleGames(event);
    if (path.startsWith("calendar")) return await handleCalendar(path, event);

    if (!hasDatabase()) {
      return json(503, {
        error: "Database not configured",
        hint: "Set DATABASE_URL for API features",
      });
    }

    if (path.startsWith("auth")) return await handleAuth(path, event);
    if (path === "picks/week" && event.httpMethod === "GET") return await handleWeekPicks(event);
    if (path === "picks") {
      if (event.httpMethod === "GET") return await handleUserPicks(event);
      if (event.httpMethod === "POST") return await handlePicks(event);
    }
    if (path === "leaderboard" && event.httpMethod === "GET") return await handleLeaderboard(event);
    if (path === "history" && event.httpMethod === "GET") return await handleHistory(event);
    if (path === "stats" && event.httpMethod === "GET") return await handleStats(event);
    if (path.startsWith("admin")) return await handleAdmin(path, event);

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : 400;
    return json(status, { error: message });
  }
}

export async function runScheduledSync() {
  if (!hasDatabase()) {
    return { statusCode: 503, body: "DATABASE_URL not configured" };
  }
  try {
    const result = await syncScheduledSlates();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: err instanceof Error ? err.message : "Sync failed" };
  }
}
