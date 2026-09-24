import type { Handler } from "@netlify/functions";
import { scheduledSyncHandler } from "../../server/espn/scheduled";

/**
 * Hourly scheduled ESPN sync (schedule in netlify.toml). A no-DB month/hour gate, then one
 * DB query decides whether ESPN is called at all — see server/espn/scheduled.ts.
 */
export const handler: Handler = async () => scheduledSyncHandler();
