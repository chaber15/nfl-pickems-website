import type { HandlerEvent } from "@netlify/functions";
import { hasDatabase } from "../db";
import {
  syncEspnWeek,
  getGamesAndSyncRows,
  getGamesForWeek,
  shouldSyncWeekOnRead,
} from "../espn/sync";
import { resolveCurrentPickemsWeek } from "../../shared/espnClient";
import { buildWeekOptions } from "../../shared/weekUtils";
import { HttpError } from "./errors";
import { json } from "./http";
import { parseWeekQuery } from "./policy";

/** Total odds-fallback budget for a request-triggered sync (Netlify functions time out at 10 s). */
const READ_ODDS_DEADLINE_MS = 5000;

export async function handleGames(event: HandlerEvent) {
  const { seasonType, week } = parseWeekQuery(event.queryStringParameters ?? {});

  if (hasDatabase()) {
    let games: Awaited<ReturnType<typeof getGamesForWeek>> = [];
    let syncRows: Awaited<ReturnType<typeof getGamesAndSyncRows>>["syncRows"] | undefined;
    try {
      ({ games, syncRows } = await getGamesAndSyncRows(seasonType, week));
    } catch (err) {
      console.error("[games] DB read failed:", err);
    }

    try {
      if (await shouldSyncWeekOnRead(seasonType, week, syncRows)) {
        await syncEspnWeek(seasonType, week, { readPath: true, oddsDeadlineMs: READ_ODDS_DEADLINE_MS });
        games = await getGamesForWeek(seasonType, week);
      }
    } catch (err) {
      // Keep serving whatever the DB already has; a failed refresh isn't fatal.
      console.error("[games] sync on read failed:", err);
    }

    if (games.length > 0) {
      return json(200, {
        games,
        seasonType,
        week,
        source: "db",
      });
    }
  }

  const { fetchScoreboard } = await import("../../shared/espnClient");
  let board: Awaited<ReturnType<typeof fetchScoreboard>>;
  try {
    board = await fetchScoreboard(seasonType, week);
  } catch (err) {
    console.error("[games] ESPN fallback failed:", err);
    throw new HttpError(502, "Couldn't load games right now — try again shortly", "UPSTREAM_UNAVAILABLE");
  }
  return json(200, { ...board, source: "espn" }, { "X-Pickems-Source": "espn" });
}

export async function handleCalendar(path: string, event: HandlerEvent) {
  if (path === "calendar/current" && event.httpMethod === "GET") {
    const current = await resolveCurrentPickemsWeek();
    return json(200, current);
  }
  if (path === "calendar" && event.httpMethod === "GET") {
    return json(200, { weeks: buildWeekOptions() });
  }
  return json(404, { error: "Not found", code: "NOT_FOUND" });
}
