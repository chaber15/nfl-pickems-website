import type { HandlerEvent } from "@netlify/functions";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db";
import { dbGameToGameData, resolveActiveSeasonId } from "../espn/sync";
import type { GameData, UserPick } from "../../shared/types";
import { buildHistoryRows, computeUserStats } from "../../shared/statsCompute";
import { publicDisplayName } from "../../shared/userDisplay";
import {
  badgeDescription,
  badgeName,
  isDisplayableBadgeAward,
  isSeasonScopedBadge,
} from "../../shared/badges";
import { badgesForUser } from "../badges";
import { json, requireUser } from "./http";

async function findUserByUsername(username: string) {
  const db = getDb();
  const key = username.toLowerCase();
  const [found] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) = ${key}`)
    .limit(1);
  return found;
}

/**
 * The active season's games (optionally one week) and one user's picks on them,
 * both filtered in SQL (never loads other seasons' picks).
 */
async function loadSeasonGamesAndPicks(
  userId: string,
  weekFilter?: { seasonType: number; week: number },
): Promise<{ games: GameData[]; picks: Record<string, UserPick> }> {
  const db = getDb();
  const seasonId = await resolveActiveSeasonId();
  if (!seasonId) return { games: [], picks: {} };

  const weekConds: SQL[] = [eq(schema.weeks.seasonId, seasonId)];
  if (weekFilter) {
    weekConds.push(eq(schema.weeks.seasonType, weekFilter.seasonType));
    weekConds.push(eq(schema.weeks.weekNumber, weekFilter.week));
  }

  const [gameRows, pickRows] = await Promise.all([
    db
      .select({ game: schema.games, week: schema.weeks })
      .from(schema.games)
      .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
      .where(and(...weekConds)),
    db
      .select({
        gameId: schema.games.espnEventId,
        pick: schema.picks.pick,
        isConfidenceBet: schema.picks.isConfidenceBet,
      })
      .from(schema.picks)
      .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
      .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
      .where(and(eq(schema.picks.userId, userId), ...weekConds)),
  ]);

  const games = gameRows.map(({ game, week }) => dbGameToGameData(game, week));
  const picks: Record<string, UserPick> = {};
  for (const p of pickRows) {
    picks[p.gameId] = { gameId: p.gameId, pick: p.pick, isConfidenceBet: p.isConfidenceBet };
  }
  return { games, picks };
}

export async function handleHistory(event: HandlerEvent) {
  const { user: sessionUser } = await requireUser(event);
  const params = event.queryStringParameters ?? {};
  const seasonType = params.seasonType != null ? Number(params.seasonType) : null;
  const week = params.week != null ? Number(params.week) : null;
  const usernameParam = params.username?.trim();

  let targetUser = sessionUser;
  if (usernameParam) {
    const found = await findUserByUsername(usernameParam);
    if (!found || found.isBanned) return json(404, { error: "User not found" });
    targetUser = found;
  }

  const weekFilter =
    seasonType != null && week != null && Number.isFinite(seasonType) && Number.isFinite(week)
      ? { seasonType, week }
      : undefined;
  const { games, picks } = await loadSeasonGamesAndPicks(targetUser.id, weekFilter);

  return json(200, {
    history: buildHistoryRows(games, picks),
    username: targetUser.username,
    displayName: publicDisplayName(targetUser),
  });
}

export async function handleStats(event: HandlerEvent) {
  const { user: sessionUser } = await requireUser(event);
  const params = event.queryStringParameters ?? {};
  const usernameParam = params.username?.trim();

  let targetUser = sessionUser;
  if (usernameParam) {
    const found = await findUserByUsername(usernameParam);
    if (!found || found.isBanned) return json(404, { error: "User not found" });
    targetUser = found;
  }

  const [{ games, picks }, badgeRowsFresh] = await Promise.all([
    loadSeasonGamesAndPicks(targetUser.id),
    badgesForUser(targetUser.id),
  ]);

  return json(200, {
    stats: computeUserStats(games, picks),
    username: targetUser.username,
    displayName: publicDisplayName(targetUser),
    badges: badgeRowsFresh
      .filter((b) => isDisplayableBadgeAward(b.badgeId, b.weekNumber))
      .map((b) => ({
        badgeId: b.badgeId,
        name: badgeName(b.badgeId),
        description: badgeDescription(b.badgeId),
        seasonType: b.seasonType,
        weekNumber: isSeasonScopedBadge(b.weekNumber) ? null : b.weekNumber,
        earnedAt: b.earnedAt.toISOString(),
      })),
  });
}
