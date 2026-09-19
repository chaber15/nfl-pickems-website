import type { Handler } from "@netlify/functions";
import { routeApiRequest, runScheduledSync } from "../../server/api/router";

export const handler: Handler = async (event) => routeApiRequest(event);

/** Midweek / off-peak cron — always syncs (lines, light refresh). */
export const syncHandler: Handler = async () => runScheduledSync();

/** Gameday cron — only runs ESPN work inside Sun/Mon/Thu night windows (ET). */
export const syncGamedayHandler: Handler = async () => {
  const { isNflGameWindow } = await import("../../shared/nflSyncWindow");
  if (!isNflGameWindow()) {
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true, reason: "outside_nfl_game_window" }),
    };
  }
  return runScheduledSync();
};
