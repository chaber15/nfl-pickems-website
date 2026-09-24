import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb, schema } from "./db";
import {
  compareSlates,
  computeDesiredBadges,
  diffBadgeRows,
  isSlateComplete,
  LIFETIME_THRESHOLD_BADGE_IDS,
  type DesiredBadgeRow,
  type ExistingBadgeRow,
  type SeasonSlate,
} from "../shared/badges";
import type { UserPick } from "../shared/types";
import { dbGameToGameData, resolveActiveSeasonId } from "./espn/sync";

/*
 * Badge engine: load the active season in a handful of queries, compute the complete desired
 * set of badge rows in memory (shared/badges.ts `computeDesiredBadges`), diff it against the
 * existing rows (`diffBadgeRows`) and apply inserts + deletes in ONE `db.batch` (neon-http runs
 * a batch as a single transaction). Existing rows that stay keep their original earnedAt.
 *
 * Deletion scope (see `BadgeDiffScope`): only non-banned users' rows, only rows earned since the
 * active season row was created, only week rows for weeks of the active season, and only
 * season_once badges the engine recomputes. Rows from earlier seasons are never deleted.
 */

type SeasonData = {
  seasonStartedAt: Date | null;
  users: Array<{ userId: string; username: string; displayName: string | null }>;
  slates: SeasonSlate[];
  picksByUser: Map<string, Record<string, UserPick>>;
  existing: ExistingBadgeRow[];
};

async function loadSeasonData(): Promise<SeasonData | null> {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return null;

  const [seasonRows, users, gameRows, pickRows, existing] = await Promise.all([
    db
      .select({ createdAt: schema.seasons.createdAt })
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))
      .limit(1),
    db
      .select({
        userId: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
      })
      .from(schema.users)
      .where(eq(schema.users.isBanned, false)),
    db
      .select({ game: schema.games, week: schema.weeks })
      .from(schema.games)
      .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
      .where(eq(schema.weeks.seasonId, seasonId)),
    db
      .select({
        userId: schema.picks.userId,
        espnEventId: schema.games.espnEventId,
        pick: schema.picks.pick,
        isConfidenceBet: schema.picks.isConfidenceBet,
      })
      .from(schema.picks)
      .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
      .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
      .where(eq(schema.weeks.seasonId, seasonId)),
    db.select().from(schema.userBadges),
  ]);

  const slateByKey = new Map<string, SeasonSlate>();
  for (const { game, week } of gameRows) {
    const key = `${week.seasonType}-${week.weekNumber}`;
    let slate = slateByKey.get(key);
    if (!slate) {
      slate = { seasonType: week.seasonType, weekNumber: week.weekNumber, games: [] };
      slateByKey.set(key, slate);
    }
    slate.games.push(dbGameToGameData(game, week));
  }
  for (const s of slateByKey.values()) {
    s.games.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.id.localeCompare(b.id));
  }

  const picksByUser = new Map<string, Record<string, UserPick>>();
  for (const p of pickRows) {
    let m = picksByUser.get(p.userId);
    if (!m) {
      m = {};
      picksByUser.set(p.userId, m);
    }
    m[p.espnEventId] = { gameId: p.espnEventId, pick: p.pick, isConfidenceBet: p.isConfidenceBet };
  }

  return {
    seasonStartedAt: seasonRows[0]?.createdAt ?? null,
    users,
    slates: [...slateByKey.values()].sort(compareSlates),
    picksByUser,
    existing,
  };
}

export type BadgeSyncResult = {
  inserted: DesiredBadgeRow[];
  deleted: ExistingBadgeRow[];
  kept: ExistingBadgeRow[];
  desiredCount: number;
  slates: Array<{ seasonType: number; weekNumber: number; status: "ok" | "skipped_incomplete" }>;
  userCount: number;
};

/**
 * Recompute and apply the full badge diff for the active season.
 * `dryRun` computes the diff without writing. `onlyBadgeIds` restricts the diff.
 */
export async function syncSeasonBadges(opts?: {
  dryRun?: boolean;
  onlyBadgeIds?: ReadonlySet<string>;
}): Promise<BadgeSyncResult> {
  const data = await loadSeasonData();
  if (!data) {
    return { inserted: [], deleted: [], kept: [], desiredCount: 0, slates: [], userCount: 0 };
  }

  const { rows: desired } = computeDesiredBadges({
    users: data.users,
    slates: data.slates,
    picksByUser: data.picksByUser,
  });

  const diff = diffBadgeRows(data.existing, desired, {
    userIds: new Set(data.users.map((u) => u.userId)),
    weekKeys: new Set(data.slates.map((s) => `${s.seasonType}-${s.weekNumber}`)),
    seasonStartedAt: data.seasonStartedAt,
    onlyBadgeIds: opts?.onlyBadgeIds,
  });

  let inserted = diff.toInsert;
  if (!opts?.dryRun && (diff.toInsert.length > 0 || diff.toDelete.length > 0)) {
    const db = getDb();
    const ops: BatchItem<"pg">[] = [];
    if (diff.toDelete.length > 0) {
      ops.push(
        db.delete(schema.userBadges).where(
          inArray(
            schema.userBadges.id,
            diff.toDelete.map((r) => r.id),
          ),
        ),
      );
    }
    const insertIndex = ops.length;
    if (diff.toInsert.length > 0) {
      ops.push(
        db
          .insert(schema.userBadges)
          .values(
            diff.toInsert.map((r) => ({
              userId: r.userId,
              badgeId: r.badgeId,
              seasonType: r.seasonType,
              weekNumber: r.weekNumber,
            })),
          )
          // A concurrent run may have inserted the same row; the unique indexes make that a no-op.
          .onConflictDoNothing()
          .returning({ userId: schema.userBadges.userId, badgeId: schema.userBadges.badgeId }),
      );
    }
    const results = await db.batch(ops as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    if (diff.toInsert.length > 0) {
      const written = results[insertIndex] as Array<{ userId: string; badgeId: string }>;
      if (written.length !== diff.toInsert.length) {
        const got = new Set(written.map((w) => `${w.userId}|${w.badgeId}`));
        inserted = diff.toInsert.filter((r) => got.has(`${r.userId}|${r.badgeId}`));
      }
    }
  }

  return {
    inserted,
    deleted: diff.toDelete,
    kept: diff.kept,
    desiredCount: desired.length,
    slates: data.slates.map((s) => ({
      seasonType: s.seasonType,
      weekNumber: s.weekNumber,
      status: isSlateComplete(s.games) ? "ok" : "skipped_incomplete",
    })),
    userCount: data.users.length,
  };
}

async function loadWeekGames(seasonType: number, weekNumber: number) {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return [];
  const rows = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(
      and(
        eq(schema.weeks.seasonId, seasonId),
        eq(schema.weeks.seasonType, seasonType),
        eq(schema.weeks.weekNumber, weekNumber),
      ),
    );
  return rows.map(({ game, week }) => dbGameToGameData(game, week));
}

/**
 * Cron entry point. Idempotent: skips unless every game in the week is final (and ≥1 graded);
 * otherwise runs the full season diff, which is a no-op when badges are already in place.
 */
export async function awardBadgesIfWeekComplete(
  seasonType: number,
  week: number,
): Promise<{ awarded: number; removed?: number; skipped?: string }> {
  const games = await loadWeekGames(seasonType, week);
  if (games.length === 0) return { awarded: 0, skipped: "empty" };
  if (!isSlateComplete(games)) return { awarded: 0, skipped: "incomplete" };
  const result = await syncSeasonBadges();
  return { awarded: result.inserted.length, removed: result.deleted.length };
}

const LIFETIME_IDS: ReadonlySet<string> = new Set(LIFETIME_THRESHOLD_BADGE_IDS);

function lifetimeSummary(result: BadgeSyncResult) {
  const removed = result.deleted.filter((r) => LIFETIME_IDS.has(r.badgeId)).length;
  const granted = result.inserted.filter((r) => LIFETIME_IDS.has(r.badgeId)).length;
  return { removed, granted, countsByUser: result.userCount };
}

/**
 * Reconcile cumulative (lifetime-threshold) badges only: insert missing, delete unearned.
 * Same signature as before; no longer wipes-then-reinserts (earnedAt is preserved).
 */
export async function reconcileLifetimeThresholdBadges(): Promise<{
  removed: number;
  granted: number;
  countsByUser: number;
  remainingAfterWipe: number;
}> {
  const result = await syncSeasonBadges({ onlyBadgeIds: LIFETIME_IDS });
  return {
    ...lifetimeSummary(result),
    // Kept for API compatibility: rows of these badges that were kept untouched.
    remainingAfterWipe: result.kept.filter((r) => LIFETIME_IDS.has(r.badgeId)).length,
  };
}

/**
 * Award badges once the week's full slate is final. Thin wrapper over the season diff
 * (which also covers earlier weeks, so it self-heals any missed runs).
 */
export async function awardBadgesForWeek(
  seasonType: number,
  weekNumber: number,
  _opts?: { skipLifetimeReconcile?: boolean },
): Promise<{
  awarded: number;
  removed?: number;
  skipped?: "empty" | "incomplete";
  lifetime?: { removed: number; granted: number; countsByUser: number };
}> {
  const games = await loadWeekGames(seasonType, weekNumber);
  if (games.length === 0) return { awarded: 0, skipped: "empty" };
  if (!isSlateComplete(games)) return { awarded: 0, skipped: "incomplete" };
  const result = await syncSeasonBadges();
  return {
    awarded: result.inserted.length,
    removed: result.deleted.length,
    lifetime: lifetimeSummary(result),
  };
}

export type BadgeRefreshWeekResult = {
  seasonType: number;
  week: number;
  awarded: number;
  status: "ok" | "skipped_empty" | "skipped_incomplete";
};

/**
 * Admin / backfill. Both modes run the same full-season diff (no wipe): `allCompleted` reports
 * every week of the active season; `{seasonType, week}` reports just that week.
 * `awarded` per week = rows inserted whose source is that week.
 */
export async function refreshBadges(opts: {
  seasonType?: number;
  week?: number;
  allCompleted?: boolean;
}): Promise<{
  weeks: BadgeRefreshWeekResult[];
  totalAwarded: number;
  totalRemoved: number;
  wiped?: number;
  lifetime: {
    removed: number;
    granted: number;
    countsByUser: number;
    remainingAfterWipe?: number;
  };
}> {
  if (!opts.allCompleted) {
    const { seasonType, week } = opts;
    if (seasonType == null || week == null || !Number.isFinite(seasonType) || !Number.isFinite(week)) {
      throw new Error("seasonType and week are required (or pass allCompleted: true)");
    }
  }

  const result = await syncSeasonBadges();
  const awardedBySlate = new Map<string, number>();
  for (const r of result.inserted) {
    const key = `${r.source.seasonType}-${r.source.weekNumber}`;
    awardedBySlate.set(key, (awardedBySlate.get(key) ?? 0) + 1);
  }

  let weeks: BadgeRefreshWeekResult[] = result.slates.map((s) => ({
    seasonType: s.seasonType,
    week: s.weekNumber,
    awarded: awardedBySlate.get(`${s.seasonType}-${s.weekNumber}`) ?? 0,
    status: s.status,
  }));
  if (!opts.allCompleted) {
    const match = weeks.find((w) => w.seasonType === opts.seasonType && w.week === opts.week);
    weeks = [
      match ?? { seasonType: opts.seasonType!, week: opts.week!, awarded: 0, status: "skipped_empty" },
    ];
  }

  return {
    weeks,
    totalAwarded: result.inserted.length,
    totalRemoved: result.deleted.length,
    lifetime: lifetimeSummary(result),
  };
}

export async function badgesForUser(userId: string) {
  try {
    const db = getDb();
    return await db.select().from(schema.userBadges).where(eq(schema.userBadges.userId, userId));
  } catch {
    return [];
  }
}

/** All badge rows, or [] if `user_badges` is not migrated yet. */
export async function allBadgeRows() {
  try {
    const db = getDb();
    return await db.select().from(schema.userBadges);
  } catch {
    return [];
  }
}
