import type { HandlerEvent } from "@netlify/functions";
import { hasDatabase } from "../db";
import {
  syncEspnWeek,
  getGamesForWeek,
  shouldSyncWeekOnRead,
} from "../espn/sync";
import { resolveCurrentPickemsWeek } from "../../shared/espnClient";
import { buildWeekOptions } from "../../shared/weekUtils";
import { json } from "./http";

export async function handleGames(event: HandlerEvent) {
  const params = event.queryStringParameters ?? {};
  const seasonType = Number(params.seasonType ?? 2);
  const week = Number(params.week ?? 1);

  if (hasDatabase()) {
    try {
      let games = await getGamesForWeek(seasonType, week);
      if (await shouldSyncWeekOnRead(seasonType, week)) {
        await syncEspnWeek(seasonType, week);
        games = await getGamesForWeek(seasonType, week);
      }
      if (games.length > 0) {
        return json(200, {
          games,
          seasonType,
          week,
          source: "db",
        });
      }
    } catch {
      /* fall through to ESPN */
    }
  }

  const { fetchScoreboard } = await import("../../shared/espnClient");
  const board = await fetchScoreboard(seasonType, week);
  return json(200, { ...board, source: "espn" });
}

export async function handleCalendar(path: string, event: HandlerEvent) {
  if (path === "calendar/current" && event.httpMethod === "GET") {
    const current = await resolveCurrentPickemsWeek();
    return json(200, current);
  }
  if (path === "calendar" && event.httpMethod === "GET") {
    return json(200, { weeks: buildWeekOptions() });
  }
  return json(404, { error: "Not found" });
}
