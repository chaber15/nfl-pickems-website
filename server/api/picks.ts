import type { HandlerEvent } from "@netlify/functions";
import { eq, and, asc } from "drizzle-orm";
import { getDb, schema } from "../db";
import { dbGameToGameData, findWeekRow, getGamesForWeek } from "../espn/sync";
import { isPlayoffPhase } from "../../shared/scoring";
import { publicDisplayName } from "../../shared/userDisplay";
import { json, requireUser } from "./http";

export async function handlePicks(event: HandlerEvent) {
  const { user } = await requireUser(event);
  const db = getDb();
  const body = JSON.parse(event.body ?? "{}") as {
    gameId?: string;
    pick?: "favorite" | "underdog";
    action?: "toggle_confidence";
  };

  if (!body.gameId) return json(400, { error: "gameId required" });

  const [row] = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(eq(schema.games.espnEventId, body.gameId))
    .limit(1);

  if (!row) return json(404, { error: "Game not found — refresh the page to sync the slate" });

  const dbGameId = row.game.id;

  const game = dbGameToGameData(row.game, row.week);
  if (new Date() >= new Date(game.kickoffAt)) {
    return json(400, { error: "Game locked at kickoff" });
  }

  const [existing] = await db
    .select()
    .from(schema.picks)
    .where(and(eq(schema.picks.userId, user.id), eq(schema.picks.gameId, dbGameId)))
    .limit(1);

  if (body.action === "toggle_confidence") {
    if (!existing) return json(400, { error: "Pick a side before marking confidence bet" });
    if (isPlayoffPhase(game.phase)) {
      return json(400, { error: "All playoff games auto-count for P/L" });
    }

    const weekPicks = await db
      .select()
      .from(schema.picks)
      .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
      .where(and(eq(schema.picks.userId, user.id), eq(schema.games.weekId, row.week.id)));

    const confCount = weekPicks.filter(
      (p) => p.picks.isConfidenceBet && p.picks.gameId !== dbGameId,
    ).length;
    const next = !existing.isConfidenceBet;
    if (next && confCount >= 5) return json(400, { error: "Max 5 confidence bets per week" });

    const [updated] = await db
      .update(schema.picks)
      .set({ isConfidenceBet: next, updatedAt: new Date() })
      .where(eq(schema.picks.id, existing.id))
      .returning();
    return json(200, { pick: updated });
  }

  if (!body.pick) return json(400, { error: "pick required" });
  if (game.spread == null || !game.favoriteSide) {
    return json(400, { error: "Line not posted yet" });
  }

  if (existing) {
    const [updated] = await db
      .update(schema.picks)
      .set({ pick: body.pick, updatedAt: new Date() })
      .where(eq(schema.picks.id, existing.id))
      .returning();
    return json(200, { pick: updated });
  }

  const [created] = await db
    .insert(schema.picks)
    .values({
      userId: user.id,
      gameId: dbGameId,
      pick: body.pick,
      isConfidenceBet: isPlayoffPhase(game.phase),
    })
    .returning();
  return json(200, { pick: created });
}

export async function handleUserPicks(event: HandlerEvent) {
  const { user } = await requireUser(event);
  const params = event.queryStringParameters ?? {};
  const seasonType = Number(params.seasonType ?? 2);
  const week = Number(params.week ?? 1);
  const db = getDb();

  const weekRow = await findWeekRow(seasonType, week);

  if (!weekRow) return json(200, { picks: {} });

  const rows = await db
    .select({ pick: schema.picks, game: schema.games })
    .from(schema.picks)
    .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
    .where(and(eq(schema.picks.userId, user.id), eq(schema.games.weekId, weekRow.id)));

  const picks: Record<string, { pick: string; isConfidenceBet: boolean }> = {};
  for (const r of rows) {
    picks[r.game.espnEventId] = { pick: r.pick.pick, isConfidenceBet: r.pick.isConfidenceBet };
  }
  return json(200, { picks });
}

export async function handleWeekPicks(event: HandlerEvent) {
  await requireUser(event);
  const params = event.queryStringParameters ?? {};
  const seasonType = Number(params.seasonType ?? 2);
  const week = Number(params.week ?? 1);
  const db = getDb();

  const games = await getGamesForWeek(seasonType, week);

  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
    })
    .from(schema.users)
    .where(eq(schema.users.isBanned, false))
    .orderBy(asc(schema.users.username));

  const weekRow = await findWeekRow(seasonType, week);

  const pickRows =
    weekRow != null
      ? await db
          .select({
            userId: schema.picks.userId,
            espnEventId: schema.games.espnEventId,
            pick: schema.picks.pick,
            isConfidenceBet: schema.picks.isConfidenceBet,
          })
          .from(schema.picks)
          .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
          .where(eq(schema.games.weekId, weekRow.id))
      : [];

  const byUser = new Map<
    string,
    Record<string, { pick: "favorite" | "underdog"; isConfidenceBet: boolean }>
  >();
  for (const row of pickRows) {
    const bucket = byUser.get(row.userId) ?? {};
    bucket[row.espnEventId] = { pick: row.pick, isConfidenceBet: row.isConfidenceBet };
    byUser.set(row.userId, bucket);
  }

  const players = users.map((u) => ({
    userId: u.id,
    username: u.username,
    displayName: publicDisplayName(u),
    picks: byUser.get(u.id) ?? {},
  }));

  return json(200, { games, players, seasonType, week });
}
