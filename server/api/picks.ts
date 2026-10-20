import type { HandlerEvent } from "@netlify/functions";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { dbGameToGameData, findWeekRow } from "../espn/sync";
import { isPostponed } from "../../shared/gameStatus";
import { isPlayoffPhase } from "../../shared/scoring";
import { CONFIDENCE_BETS_PER_WEEK, type FavoriteSide } from "../../shared/types";
import { publicDisplayName } from "../../shared/userDisplay";
import { HttpError } from "./errors";
import { json, parseJsonBody, requireUser } from "./http";
import { parseWeekQuery } from "./policy";

type PickSide = "favorite" | "underdog";

function isPickSide(value: unknown): value is PickSide {
  return value === "favorite" || value === "underdog";
}

function isVenue(value: unknown): value is FavoriteSide {
  return value === "home" || value === "away";
}

export async function handlePicks(event: HandlerEvent) {
  const { user } = await requireUser(event);
  const db = getDb();
  const body = parseJsonBody(event);

  const gameId = body.gameId;
  if (typeof gameId !== "string" || gameId.length === 0 || gameId.length > 64) {
    throw new HttpError(400, "gameId required", "INVALID_REQUEST");
  }

  // Resolve the requested operation up front so bad input never touches the DB.
  let confidenceTarget: boolean | "toggle" | null = null;
  // A side pick names the team tapped (venue); the server maps it to favorite/underdog from
  // the stored line, so a tab showing a stale favorite still saves the team the player chose.
  let venue: FavoriteSide | null = null;
  let legacyPick: PickSide | null = null;
  if (body.action === "set_confidence") {
    if (typeof body.value !== "boolean") {
      throw new HttpError(400, "value must be true or false", "INVALID_REQUEST");
    }
    confidenceTarget = body.value;
  } else if (body.action === "toggle_confidence") {
    confidenceTarget = "toggle";
  } else if (body.action !== undefined) {
    throw new HttpError(400, "Invalid action", "INVALID_REQUEST");
  } else if (isVenue(body.venue)) {
    venue = body.venue;
  } else if (isPickSide(body.pick)) {
    // Deprecated body from tabs opened before the venue protocol; remove next release.
    console.log("[picks] deprecated pick body (favorite/underdog) — client needs a refresh");
    legacyPick = body.pick;
  } else {
    throw new HttpError(400, "venue must be home or away", "INVALID_REQUEST");
  }

  const [row] = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(eq(schema.games.espnEventId, gameId))
    .limit(1);

  if (!row) {
    throw new HttpError(
      404,
      "Game not found — refresh the page to sync the slate",
      "GAME_NOT_FOUND",
    );
  }

  const dbGameId = row.game.id;

  const game = dbGameToGameData(row.game, row.week);
  if (new Date() >= new Date(game.kickoffAt)) {
    throw new HttpError(400, "Game locked at kickoff", "GAME_LOCKED");
  }
  // A postponed game can't take a new side or ★ (a guaranteed 0-unit ★); clearing a ★ still works.
  const postponed = isPostponed(game);

  if (confidenceTarget !== null) {
    const [existing] = await db
      .select()
      .from(schema.picks)
      .where(and(eq(schema.picks.userId, user.id), eq(schema.picks.gameId, dbGameId)))
      .limit(1);
    if (!existing) {
      throw new HttpError(400, "Pick a side before marking confidence bet", "NO_PICK");
    }
    if (isPlayoffPhase(game.phase)) {
      throw new HttpError(400, "All playoff games auto-count for P/L", "PLAYOFF_AUTO_CONFIDENCE");
    }

    const next = confidenceTarget === "toggle" ? !existing.isConfidenceBet : confidenceTarget;
    // Idempotent: already in the requested state.
    if (next === existing.isConfidenceBet) return json(200, { pick: existing });
    if (next && postponed) throw new HttpError(400, "Game is postponed", "GAME_POSTPONED");

    if (!next) {
      const [updated] = await db
        .update(schema.picks)
        .set({ isConfidenceBet: false, updatedAt: new Date() })
        .where(eq(schema.picks.id, existing.id))
        .returning();
      return json(200, { pick: updated ?? existing });
    }

    // Cap check and update in one statement, behind a per-user advisory lock held for the
    // batch's transaction: ★ changes for one user serialize, so two requests for different
    // games can't both count 4 and both land a 5th.
    const [, [updated]] = await db.batch([
      db.execute(sql`select pg_advisory_xact_lock(hashtext('pickems:stars'), hashtext(${user.id}::text))`),
      db
        .update(schema.picks)
        .set({ isConfidenceBet: true, updatedAt: new Date() })
        .where(
          and(
            eq(schema.picks.id, existing.id),
            sql`(
              select count(*) from ${schema.picks} p
              inner join ${schema.games} g on g.id = p.game_id
              where p.user_id = ${user.id}
                and g.week_id = ${row.week.id}
                and p.is_confidence_bet
                and p.id <> ${existing.id}
            ) < ${CONFIDENCE_BETS_PER_WEEK}`,
          ),
        )
        .returning(),
    ]);
    if (!updated) {
      throw new HttpError(
        400,
        `Max ${CONFIDENCE_BETS_PER_WEEK} confidence bets per week`,
        "CONFIDENCE_LIMIT",
      );
    }
    return json(200, { pick: updated });
  }

  if (postponed) throw new HttpError(400, "Game is postponed", "GAME_POSTPONED");
  if (game.spread == null || !game.favoriteSide) {
    throw new HttpError(400, "Line not posted yet", "NO_LINE");
  }

  const side: PickSide = venue ? (game.favoriteSide === venue ? "favorite" : "underdog") : legacyPick!;
  const [saved] = await db
    .insert(schema.picks)
    .values({
      userId: user.id,
      gameId: dbGameId,
      pick: side,
      isConfidenceBet: isPlayoffPhase(game.phase),
    })
    .onConflictDoUpdate({
      target: [schema.picks.userId, schema.picks.gameId],
      set: { pick: side, updatedAt: new Date() },
    })
    .returning();
  return json(200, { pick: saved, favoriteSide: game.favoriteSide });
}

export async function handleUserPicks(event: HandlerEvent) {
  const { user } = await requireUser(event);
  const { seasonType, week } = parseWeekQuery(event.queryStringParameters ?? {});
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
  const { seasonType, week } = parseWeekQuery(event.queryStringParameters ?? {});
  const db = getDb();

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

  return json(200, { players, seasonType, week });
}
