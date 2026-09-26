import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb, schema } from "./db";
import {
  badgeDiffFingerprint,
  compareSlates,
  computeDesiredBadges,
  describeBadgeChanges,
  diffBadgeRows,
  isSlateComplete,
  type BadgeChange,
  type DesiredBadgeRow,
  type ExistingBadgeRow,
  type SeasonSlate,
} from "../shared/badges";
import type { UserPick } from "../shared/types";
import { dbGameToGameData, resolveActiveSeasonId } from "./espn/sync";
import { HttpError } from "./api/errors";

/*
 * Badge engine (DB side): load the active season in a handful of queries, compute every badge
 * row the rules in shared/badgeDefs.ts justify (`computeDesiredBadges`), diff that against the
 * existing rows (`diffBadgeRows`), and write the inserts + deletes in ONE `db.batch` (neon-http
 * runs a batch as a single transaction). Existing rows that stay keep their original earnedAt.
 *
 * Two ways in:
 * - Hourly cron (`awardBadgesIfWeekComplete`): ADD-ONLY. It never removes a badge, so deploying a
 *   stricter rule can't silently take badges away.
 * - Admin (`previewBadgeChanges` → `applyBadgeChanges`): the full diff, adds and removes. Apply
 *   recomputes and refuses unless the result still matches the previewed fingerprint.
 *
 * Only the active season is touched (see `BadgeDiffScope` in shared/badges.ts).
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

type BadgePlan = {
  data: SeasonData;
  toInsert: DesiredBadgeRow[];
  toDelete: ExistingBadgeRow[];
  kept: ExistingBadgeRow[];
};

async function planBadgeSync(): Promise<BadgePlan | null> {
  const data = await loadSeasonData();
  if (!data) return null;
  const { rows: desired } = computeDesiredBadges(data);
  const diff = diffBadgeRows(data.existing, desired, {
    userIds: new Set(data.users.map((u) => u.userId)),
    weekKeys: new Set(data.slates.map((s) => `${s.seasonType}-${s.weekNumber}`)),
    seasonStartedAt: data.seasonStartedAt,
  });
  return { data, ...diff };
}

/** Write inserts + deletes atomically. Returns how many rows were actually inserted. */
async function writeDiff(toInsert: DesiredBadgeRow[], toDelete: ExistingBadgeRow[]): Promise<number> {
  if (toInsert.length === 0 && toDelete.length === 0) return 0;
  const db = getDb();
  const ops: BatchItem<"pg">[] = [];
  if (toDelete.length > 0) {
    ops.push(
      db.delete(schema.userBadges).where(
        inArray(
          schema.userBadges.id,
          toDelete.map((r) => r.id),
        ),
      ),
    );
  }
  const insertIndex = ops.length;
  if (toInsert.length > 0) {
    ops.push(
      db
        .insert(schema.userBadges)
        .values(
          toInsert.map((r) => ({
            userId: r.userId,
            badgeId: r.badgeId,
            seasonType: r.seasonType,
            weekNumber: r.weekNumber,
          })),
        )
        // A concurrent run may have inserted the same row; the unique indexes make that a no-op.
        .onConflictDoNothing()
        .returning({ id: schema.userBadges.id }),
    );
  }
  const results = await db.batch(ops as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  return toInsert.length > 0 ? (results[insertIndex] as unknown[]).length : 0;
}

export type BadgePreview = {
  changes: BadgeChange[];
  fingerprint: string;
  weeks: Array<{ seasonType: number; weekNumber: number; status: "ok" | "skipped_incomplete" }>;
};

function weekStatuses(slates: SeasonSlate[]): BadgePreview["weeks"] {
  return slates.map((s) => ({
    seasonType: s.seasonType,
    weekNumber: s.weekNumber,
    status: isSlateComplete(s.games) ? "ok" : "skipped_incomplete",
  }));
}

/** Admin: what a full recalculation would add and remove. Writes nothing. */
export async function previewBadgeChanges(): Promise<BadgePreview> {
  const plan = await planBadgeSync();
  if (!plan) return { changes: [], fingerprint: badgeDiffFingerprint({ toInsert: [], toDelete: [] }), weeks: [] };
  return {
    changes: describeBadgeChanges(plan, plan.data.users),
    fingerprint: badgeDiffFingerprint(plan),
    weeks: weekStatuses(plan.data.slates),
  };
}

/**
 * Admin: apply the previewed recalculation. Recomputes first and refuses (409) if the result no
 * longer matches `fingerprint` — e.g. a game went final after the preview was shown.
 */
export async function applyBadgeChanges(fingerprint: string): Promise<{ added: number; removed: number }> {
  const plan = await planBadgeSync();
  const current = badgeDiffFingerprint(plan ?? { toInsert: [], toDelete: [] });
  if (current !== fingerprint) {
    throw new HttpError(409, "Badges changed since the preview — preview again.", "BADGE_PREVIEW_STALE");
  }
  if (!plan) return { added: 0, removed: 0 };
  const added = await writeDiff(plan.toInsert, plan.toDelete);
  return { added, removed: plan.toDelete.length };
}

/**
 * Cron entry point. ADD-ONLY and idempotent: skips unless every game in the week is final
 * (and ≥1 graded); otherwise inserts any missing badges for the season. Never deletes.
 */
export async function awardBadgesIfWeekComplete(
  seasonType: number,
  week: number,
): Promise<{ awarded: number; pendingRemovals?: number; skipped?: string }> {
  const games = await loadWeekGames(seasonType, week);
  if (games.length === 0) return { awarded: 0, skipped: "empty" };
  if (!isSlateComplete(games)) return { awarded: 0, skipped: "incomplete" };
  const plan = await planBadgeSync();
  if (!plan) return { awarded: 0, skipped: "no_season" };
  const awarded = await writeDiff(plan.toInsert, []);
  // Surfaced in the cron log: rows a rule change would remove, waiting for an admin Apply.
  return plan.toDelete.length > 0 ? { awarded, pendingRemovals: plan.toDelete.length } : { awarded };
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
