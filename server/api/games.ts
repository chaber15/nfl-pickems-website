import type { HandlerEvent } from "@netlify/functions";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "../db";
import {
  syncEspnWeek,
  getGamesAndSyncRows,
  getGamesForWeek,
  resolveActiveSeasonId,
  shouldSyncWeekOnRead,
} from "../espn/sync";
import { resolveCurrentPickemsWeek } from "../../shared/espnClient";
import { buildWeekOptions, clampToAvailableWeek } from "../../shared/weekUtils";
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

/**
 * Current week from our own data when ESPN is unreachable: the active season's earliest week with a
 * game still to kick off, else its latest week with any games. Null when the DB has nothing.
 */
export async function currentWeekFromDb(now = new Date()): Promise<{ seasonType: number; week: number } | null> {
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return null;
  const db = getDb();
  const pick = async (upcomingOnly: boolean) => {
    const [row] = await db
      .select({ seasonType: schema.weeks.seasonType, weekNumber: schema.weeks.weekNumber })
      .from(schema.games)
      .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
      .where(
        upcomingOnly
          ? and(eq(schema.weeks.seasonId, seasonId), gt(schema.games.kickoffAt, now))
          : eq(schema.weeks.seasonId, seasonId),
      )
      .orderBy(
        ...(upcomingOnly
          ? [asc(schema.weeks.seasonType), asc(schema.weeks.weekNumber)]
          : [desc(schema.weeks.seasonType), desc(schema.weeks.weekNumber)]),
      )
      .limit(1);
    return row ?? null;
  };
  const row = (await pick(true)) ?? (await pick(false));
  if (!row) return null;
  return clampToAvailableWeek(row.seasonType, row.weekNumber);
}

export async function handleCalendar(path: string, event: HandlerEvent) {
  if (path === "calendar/current" && event.httpMethod === "GET") {
    try {
      const current = await resolveCurrentPickemsWeek();
      return json(200, current);
    } catch (err) {
      console.error("[calendar] ESPN current week failed, answering from DB:", err);
    }
    let fromDb: Awaited<ReturnType<typeof currentWeekFromDb>> = null;
    try {
      fromDb = await currentWeekFromDb();
    } catch (err) {
      console.error("[calendar] DB current-week fallback failed:", err);
    }
    if (!fromDb) {
      throw new HttpError(503, "Couldn't determine the current week", "UPSTREAM_UNAVAILABLE");
    }
    // Marked so the router keeps this answer out of the CDN (see cacheHeadersFor).
    return json(200, { ...fromDb, source: "db" }, { "X-Pickems-Source": "db-fallback" });
  }
  if (path === "calendar" && event.httpMethod === "GET") {
    return json(200, { weeks: buildWeekOptions() });
  }
  return json(404, { error: "Not found", code: "NOT_FOUND" });
}
