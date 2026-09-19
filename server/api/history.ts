import type { HandlerEvent } from "@netlify/functions";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { dbGameToGameData, getActiveSeasonGameRows } from "../espn/sync";
import type { UserPick } from "../../shared/types";
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

export async function handleHistory(event: HandlerEvent) {
  const { user: sessionUser } = await requireUser(event);
  const db = getDb();
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

  let gameRows = await getActiveSeasonGameRows();

  if (seasonType != null && week != null) {
    gameRows = gameRows.filter(
      (r) => r.week.seasonType === seasonType && r.week.weekNumber === week,
    );
  }

  const userPicks = await db.select().from(schema.picks).where(eq(schema.picks.userId, targetUser.id));

  const games = gameRows.map(({ game, week: w }) => dbGameToGameData(game, w));
  const espnByDbId = new Map(gameRows.map(({ game }) => [game.id, game.espnEventId]));
  const picks: Record<string, UserPick> = {};
  for (const p of userPicks) {
    const publicId = espnByDbId.get(p.gameId);
    if (!publicId) continue;
    picks[publicId] = {
      gameId: publicId,
      pick: p.pick,
      isConfidenceBet: p.isConfidenceBet,
    };
  }

  return json(200, {
    history: buildHistoryRows(games, picks),
    username: targetUser.username,
    displayName: publicDisplayName(targetUser),
  });
}

export async function handleStats(event: HandlerEvent) {
  const { user: sessionUser } = await requireUser(event);
  const db = getDb();
  const params = event.queryStringParameters ?? {};
  const usernameParam = params.username?.trim();

  let targetUser = sessionUser;
  if (usernameParam) {
    const found = await findUserByUsername(usernameParam);
    if (!found || found.isBanned) return json(404, { error: "User not found" });
    targetUser = found;
  }

  const allGames = await getActiveSeasonGameRows();

  const userPicks = await db.select().from(schema.picks).where(eq(schema.picks.userId, targetUser.id));

  const games = allGames.map(({ game, week }) => dbGameToGameData(game, week));
  const espnByDbId = new Map(allGames.map(({ game }) => [game.id, game.espnEventId]));
  const picks: Record<string, UserPick> = {};
  for (const p of userPicks) {
    const publicId = espnByDbId.get(p.gameId);
    if (!publicId) continue;
    picks[publicId] = {
      gameId: publicId,
      pick: p.pick,
      isConfidenceBet: p.isConfidenceBet,
    };
  }

  const badgeRowsFresh = await badgesForUser(targetUser.id);

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
