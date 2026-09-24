import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "../db";
import { resolveCurrentPickemsWeek } from "../../shared/espnClient";
import { computeLineLockAt, isPastLineLock, LINE_LOCK_TIMEZONE } from "../../shared/lineLock";
import { clampToAvailableWeek, isValidPickemsWeek } from "../../shared/weekUtils";
import { STALE_UNFINISHED_MS, syncEspnWeek } from "./sync";

/** Sync ahead of a kickoff so the hourly run before a game catches its final pre-game state. */
export const KICKOFF_SOON_MS = 60 * 60 * 1000;
/** Pre-lock line refresh cadence. */
export const LINE_REFRESH_MS = 12 * 60 * 60 * 1000;
/** Rows considered by the scheduler: a week back (grading) to two weeks ahead (lines). */
const WINDOW_BACK_MS = 8 * 24 * 60 * 60 * 1000;
const WINDOW_AHEAD_MS = 14 * 24 * 60 * 60 * 1000;

function etParts(now: Date): { month: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LINE_LOCK_TIMEZONE,
    month: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  let hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (hour === 24) hour = 0;
  return { month, hour };
}

export type GateResult = { run: true } | { run: false; reason: "offseason" | "overnight" };

/**
 * Cheap no-DB gate for the hourly cron (America/New_York, DST-aware):
 * - March–July: offseason, skip.
 * - 2:00–8:59am: no NFL game is live (earliest kickoff is 9:30am London games), skip.
 */
export function scheduledGate(now = new Date()): GateResult {
  const { month, hour } = etParts(now);
  if (month >= 3 && month <= 7) return { run: false, reason: "offseason" };
  if (hour >= 2 && hour <= 8) return { run: false, reason: "overnight" };
  return { run: true };
}

export type ScheduleRow = {
  seasonType: number;
  weekNumber: number;
  kickoffAt: Date;
  status: string;
  updatedAt: Date;
};

export type SyncReason = "live" | "kickoff_soon" | "line_refresh";
export type SyncTarget = { seasonType: number; week: number; reasons: SyncReason[] };

/**
 * Pure scheduling decision from the active season's games near `now`:
 * - live: kicked off and not final (live scores / needs final), ignoring games stuck
 *   non-final for days (postponed / canceled);
 * - kickoff_soon: a game kicks off within the next hour;
 * - line_refresh: an upcoming week before its line lock whose newest update is >12h old.
 * `bootstrapCheck` = no upcoming games stored → ask ESPN whether a new week needs rows.
 */
export function decideScheduledSync(
  rows: readonly ScheduleRow[],
  now: Date,
): { targets: SyncTarget[]; bootstrapCheck: boolean } {
  const t = now.getTime();
  const byWeek = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    const key = `${r.seasonType}:${r.weekNumber}`;
    const list = byWeek.get(key);
    if (list) list.push(r);
    else byWeek.set(key, [r]);
  }

  const targets: SyncTarget[] = [];
  for (const weekRows of byWeek.values()) {
    const { seasonType, weekNumber } = weekRows[0]!;
    if (!isValidPickemsWeek(seasonType, weekNumber)) continue;
    const reasons: SyncReason[] = [];

    const live = weekRows.some((r) => {
      const k = r.kickoffAt.getTime();
      return r.status !== "final" && k <= t && k > t - STALE_UNFINISHED_MS;
    });
    if (live) reasons.push("live");

    const soon = weekRows.some((r) => {
      const k = r.kickoffAt.getTime();
      return k > t && k <= t + KICKOFF_SOON_MS;
    });
    if (soon) reasons.push("kickoff_soon");

    const upcoming = weekRows.some((r) => r.kickoffAt.getTime() > t);
    if (upcoming) {
      const lockAt = computeLineLockAt(weekRows.map((r) => r.kickoffAt.toISOString()));
      const newest = Math.max(...weekRows.map((r) => r.updatedAt.getTime()));
      if (!isPastLineLock(lockAt, now) && t - newest > LINE_REFRESH_MS) reasons.push("line_refresh");
    }

    if (reasons.length > 0) targets.push({ seasonType, week: weekNumber, reasons });
  }

  const bootstrapCheck = !rows.some((r) => r.kickoffAt.getTime() > t);
  return { targets, bootstrapCheck };
}

/** One query: active season games from a week ago to two weeks ahead. */
async function loadScheduleRows(now: Date): Promise<ScheduleRow[]> {
  const db = getDb();
  const activeSeason = sql`coalesce(
    (select ${schema.siteSettings.currentSeasonId} from ${schema.siteSettings} where ${schema.siteSettings.id} = 1),
    (select ${schema.seasons.id} from ${schema.seasons} order by ${schema.seasons.year} desc limit 1)
  )`;
  return db
    .select({
      seasonType: schema.weeks.seasonType,
      weekNumber: schema.weeks.weekNumber,
      kickoffAt: schema.games.kickoffAt,
      status: schema.games.status,
      updatedAt: schema.games.updatedAt,
    })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(
      and(
        eq(schema.weeks.seasonId, activeSeason),
        gt(schema.games.kickoffAt, new Date(now.getTime() - WINDOW_BACK_MS)),
        lt(schema.games.kickoffAt, new Date(now.getTime() + WINDOW_AHEAD_MS)),
      ),
    );
}

/** Does the given season year already have game rows for this week? */
async function weekHasRows(seasonYear: number, seasonType: number, week: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: schema.games.id })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .innerJoin(schema.seasons, eq(schema.weeks.seasonId, schema.seasons.id))
    .where(
      and(
        eq(schema.seasons.year, seasonYear),
        eq(schema.weeks.seasonType, seasonType),
        eq(schema.weeks.weekNumber, week),
      ),
    )
    .limit(1);
  return row != null;
}

type WeekSyncSummary = {
  seasonType: number;
  week: number;
  reasons: Array<SyncReason | "bootstrap">;
  upserted?: number;
  picksSwapped?: number;
  badges?: unknown;
  error?: string;
};

export type ScheduledSyncSummary = {
  skipped?: string;
  synced: WeekSyncSummary[];
};

export async function runScheduledEspnSync(now = new Date()): Promise<ScheduledSyncSummary> {
  const gate = scheduledGate(now);
  if (!gate.run) return { skipped: gate.reason, synced: [] };

  const rows = await loadScheduleRows(now);
  const { targets, bootstrapCheck } = decideScheduledSync(rows, now);
  const plan: Array<{ seasonType: number; week: number; reasons: WeekSyncSummary["reasons"] }> = [...targets];

  if (bootstrapCheck) {
    // Nothing upcoming stored: ask ESPN (status-only, no odds) for the current pick'em week.
    // Preseason / offseason (ESPN types 1 and 4) are skipped: the new-season rollover is
    // handled separately (deferred to the offseason work).
    const current = await resolveCurrentPickemsWeek(now);
    const wk = clampToAvailableWeek(current.seasonType, current.week);
    const planned = plan.some((p) => p.seasonType === wk.seasonType && p.week === wk.week);
    if (
      (current.seasonType === 2 || current.seasonType === 3) &&
      !planned &&
      isValidPickemsWeek(wk.seasonType, wk.week) &&
      !(await weekHasRows(current.seasonYear, wk.seasonType, wk.week))
    ) {
      plan.push({ ...wk, reasons: ["bootstrap"] });
    }
  }

  if (plan.length === 0) return { skipped: "nothing_due", synced: [] };

  const synced: WeekSyncSummary[] = [];
  for (const target of plan) {
    const summary: WeekSyncSummary = { ...target };
    try {
      const result = await syncEspnWeek(target.seasonType, target.week);
      summary.upserted = result.upserted;
      summary.picksSwapped = result.picksSwapped;

      // Idempotent: a no-op (2 cheap queries) unless the week is fully final with badges to award.
      const { awardBadgesIfWeekComplete } = await import("../badges");
      summary.badges = await awardBadgesIfWeekComplete(target.seasonType, target.week);
    } catch (err) {
      console.error(`Scheduled ESPN sync failed for ${target.seasonType}/${target.week}:`, err);
      summary.error = err instanceof Error ? err.message : String(err);
    }
    synced.push(summary);
  }

  return { synced };
}

/** Netlify scheduled-function response wrapper. */
export async function scheduledSyncHandler(): Promise<{ statusCode: number; body: string }> {
  if (!hasDatabase()) {
    console.error("Scheduled ESPN sync: DATABASE_URL not configured");
    return { statusCode: 500, body: JSON.stringify({ error: "DATABASE_URL not configured" }) };
  }
  try {
    const summary = await runScheduledEspnSync();
    const failed = summary.synced.some((s) => s.error);
    return { statusCode: failed ? 500 : 200, body: JSON.stringify(summary) };
  } catch (err) {
    console.error("Scheduled ESPN sync failed:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Scheduled sync failed" }) };
  }
}
