import type { Handler, HandlerEvent } from "@netlify/functions";
import { hasDatabase } from "../../server/db";
import {
  parseCookies,
  buildSessionCookie,
  clearSessionCookie,
  getSessionCookieName,
  getUserFromSession,
  registerOrLogin,
  logout,
} from "../../server/auth";
import { syncEspnWeek, getGamesForWeek, dbGameToGameData } from "../../server/espn/sync";
import { getDb, schema } from "../../server/db";
import { eq, and, ne, asc } from "drizzle-orm";
import {
  pickCorrectness,
  unitsDelta,
  computeWinPct,
  isPlayoffPhase,
  isGradedForStandings,
  weekPlEligible,
} from "../../shared/scoring";
import type { GameData, LeaderboardEntry, UserPick } from "../../shared/types";
import { buildHistoryRows, computeUserStats } from "../../shared/statsCompute";
import { detectCurrentWeek } from "../../shared/espnClient";
import { buildWeekOptions } from "../../shared/weekUtils";

function json(statusCode: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

function isSecure(event: HandlerEvent) {
  return event.headers["x-forwarded-proto"] === "https";
}

async function requireUser(event: HandlerEvent) {
  const cookies = parseCookies(event.headers.cookie ?? null);
  const token = cookies[getSessionCookieName()];
  const user = await getUserFromSession(token);
  if (!user) throw new Error("Unauthorized");
  return { user, token };
}

async function handleAuth(path: string, event: HandlerEvent) {
  const secure = isSecure(event);
  const cookies = parseCookies(event.headers.cookie ?? null);
  const token = cookies[getSessionCookieName()];

  if (path === "auth/me" && event.httpMethod === "GET") {
    const user = await getUserFromSession(token);
    return json(200, {
      user: user ? { id: user.id, username: user.username, isAdmin: user.isAdmin } : null,
    });
  }

  if (path === "auth/login" && event.httpMethod === "POST") {
    const body = JSON.parse(event.body ?? "{}") as { username?: string };
    const { user, token: newToken, created } = await registerOrLogin(body.username ?? "");
    return json(
      200,
      { user: { id: user.id, username: user.username, isAdmin: user.isAdmin }, created },
      { "Set-Cookie": buildSessionCookie(newToken, secure) },
    );
  }

  if (path === "auth/logout" && event.httpMethod === "POST") {
    await logout(token);
    return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie(secure) });
  }

  return json(404, { error: "Not found" });
}

async function handleGames(event: HandlerEvent) {
  const params = event.queryStringParameters ?? {};
  const seasonType = Number(params.seasonType ?? 1);
  const week = Number(params.week ?? 4);

  if (hasDatabase()) {
    try {
      const games = await getGamesForWeek(seasonType, week);
      if (games.length > 0) {
        return json(200, { games, seasonType, week, source: "db" });
      }
    } catch {
      /* fall through to ESPN */
    }
  }

  const { fetchScoreboard } = await import("../../shared/espnClient");
  const board = await fetchScoreboard(seasonType, week);
  return json(200, { ...board, source: "espn" });
}

async function handleCalendar(path: string, event: HandlerEvent) {
  if (path === "calendar/current" && event.httpMethod === "GET") {
    const current = await detectCurrentWeek();
    return json(200, current);
  }
  if (path === "calendar" && event.httpMethod === "GET") {
    return json(200, { weeks: buildWeekOptions() });
  }
  return json(404, { error: "Not found" });
}

async function handlePicks(event: HandlerEvent) {
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
    .where(eq(schema.games.id, body.gameId))
    .limit(1);

  if (!row) return json(404, { error: "Game not found" });

  const game = dbGameToGameData(row.game, row.week);
  if (new Date() >= new Date(game.kickoffAt)) {
    return json(400, { error: "Game locked at kickoff" });
  }

  const [existing] = await db
    .select()
    .from(schema.picks)
    .where(and(eq(schema.picks.userId, user.id), eq(schema.picks.gameId, body.gameId)))
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
      (p) => p.picks.isConfidenceBet && p.picks.gameId !== body.gameId,
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
      gameId: body.gameId,
      pick: body.pick,
      isConfidenceBet: isPlayoffPhase(game.phase),
    })
    .returning();
  return json(200, { pick: created });
}

async function handleUserPicks(event: HandlerEvent) {
  const { user } = await requireUser(event);
  const params = event.queryStringParameters ?? {};
  const seasonType = Number(params.seasonType ?? 1);
  const week = Number(params.week ?? 4);
  const db = getDb();

  const [weekRow] = await db
    .select()
    .from(schema.weeks)
    .where(and(eq(schema.weeks.seasonType, seasonType), eq(schema.weeks.weekNumber, week)))
    .limit(1);

  if (!weekRow) return json(200, { picks: {} });

  const rows = await db
    .select({ pick: schema.picks, game: schema.games })
    .from(schema.picks)
    .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
    .where(and(eq(schema.picks.userId, user.id), eq(schema.games.weekId, weekRow.id)));

  const picks: Record<string, { pick: string; isConfidenceBet: boolean }> = {};
  for (const r of rows) {
    picks[r.game.id] = { pick: r.pick.pick, isConfidenceBet: r.pick.isConfidenceBet };
  }
  return json(200, { picks });
}

async function handleWeekPicks(event: HandlerEvent) {
  await requireUser(event);
  const params = event.queryStringParameters ?? {};
  const seasonType = Number(params.seasonType ?? 1);
  const week = Number(params.week ?? 4);
  const db = getDb();

  const games = await getGamesForWeek(seasonType, week);

  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
    })
    .from(schema.users)
    .where(eq(schema.users.isBanned, false))
    .orderBy(asc(schema.users.username));

  const [weekRow] = await db
    .select()
    .from(schema.weeks)
    .where(and(eq(schema.weeks.seasonType, seasonType), eq(schema.weeks.weekNumber, week)))
    .limit(1);

  const pickRows =
    weekRow != null
      ? await db
          .select({
            userId: schema.picks.userId,
            gameId: schema.picks.gameId,
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
    bucket[row.gameId] = { pick: row.pick, isConfidenceBet: row.isConfidenceBet };
    byUser.set(row.userId, bucket);
  }

  const players = users.map((u) => ({
    userId: u.id,
    username: u.username,
    picks: byUser.get(u.id) ?? {},
  }));

  return json(200, { games, players, seasonType, week });
}

async function computeLeaderboard(filter?: {
  seasonType: number;
  week: number;
}): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const activeUsers = await db.select().from(schema.users).where(eq(schema.users.isBanned, false));

  let allGames = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id));

  if (filter) {
    allGames = allGames.filter(
      (r) => r.week.seasonType === filter.seasonType && r.week.weekNumber === filter.week,
    );
  }

  const allPicks = await db
    .select({ pick: schema.picks, game: schema.games, week: schema.weeks })
    .from(schema.picks)
    .innerJoin(schema.games, eq(schema.picks.gameId, schema.games.id))
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id));

  const entries: LeaderboardEntry[] = [];

  for (const u of activeUsers) {
    let correct = 0;
    let total = 0;
    let confidencePl = 0;

    // Eligibility uses ALL ★ bets in a week (even before finals).
    // P/L units only sum from finals.
    const weekStats = new Map<
      string,
      { count: number; phase: GameData["phase"]; rawPl: number }
    >();

    for (const { game, week } of allGames) {
      const g = dbGameToGameData(game, week);
      const weekKey = week.id;
      const existing = weekStats.get(weekKey) ?? {
        count: 0,
        phase: week.phase as GameData["phase"],
        rawPl: 0,
      };

      const userPick = allPicks.find((p) => p.pick.userId === u.id && p.game.id === game.id);

      if (userPick?.pick.isConfidenceBet) {
        existing.count++;
        if (
          isGradedForStandings(g) &&
          g.spread != null &&
          g.favoriteSide &&
          g.atsResult
        ) {
          existing.rawPl += unitsDelta(
            userPick.pick.pick,
            g.atsResult,
            g.favoriteSide,
            g.oddsAway,
            g.oddsHome,
          );
        }
      }
      weekStats.set(weekKey, existing);

      if (!isGradedForStandings(g)) continue;
      total++;
      correct += pickCorrectness(userPick?.pick.pick ?? null, g.atsResult);
    }

    let weeksComplete = 0;
    for (const { count, phase, rawPl } of weekStats.values()) {
      // Eligible weeks with activity only (skip empty playoff weeks for inactive users)
      if (weekPlEligible(phase, count) && count > 0) {
        confidencePl += rawPl;
        weeksComplete++;
      }
    }

    // Skip users with no graded games in a weekly board (keeps mini board clean)
    if (filter && total === 0 && confidencePl === 0) continue;

    entries.push({
      userId: u.id,
      username: u.username,
      winPct: computeWinPct(correct, total),
      correct,
      total,
      confidencePl,
      weeksComplete,
    });
  }

  entries.sort((a, b) => b.winPct - a.winPct || b.confidencePl - a.confidencePl);
  return entries;
}

async function handleLeaderboard(event: HandlerEvent) {
  const params = event.queryStringParameters ?? {};
  const seasonType = params.seasonType != null ? Number(params.seasonType) : null;
  const week = params.week != null ? Number(params.week) : null;
  const filter =
    seasonType != null && week != null && Number.isFinite(seasonType) && Number.isFinite(week)
      ? { seasonType, week }
      : undefined;
  const entries = await computeLeaderboard(filter);
  return json(200, { entries, scope: filter ? "week" : "overall", ...filter });
}

async function handleHistory(event: HandlerEvent) {
  const { user } = await requireUser(event);
  const db = getDb();
  const params = event.queryStringParameters ?? {};
  const seasonType = params.seasonType != null ? Number(params.seasonType) : null;
  const week = params.week != null ? Number(params.week) : null;

  let gameRows = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id));

  if (seasonType != null && week != null) {
    gameRows = gameRows.filter(
      (r) => r.week.seasonType === seasonType && r.week.weekNumber === week,
    );
  }

  const userPicks = await db.select().from(schema.picks).where(eq(schema.picks.userId, user.id));

  const games = gameRows.map(({ game, week: w }) => dbGameToGameData(game, w));
  const picks: Record<string, UserPick> = {};
  for (const p of userPicks) {
    picks[p.gameId] = {
      gameId: p.gameId,
      pick: p.pick,
      isConfidenceBet: p.isConfidenceBet,
    };
  }

  return json(200, { history: buildHistoryRows(games, picks) });
}

async function handleStats(event: HandlerEvent) {
  const { user } = await requireUser(event);
  const db = getDb();

  const allGames = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id));

  const userPicks = await db.select().from(schema.picks).where(eq(schema.picks.userId, user.id));

  const games = allGames.map(({ game, week }) => dbGameToGameData(game, week));
  const picks: Record<string, UserPick> = {};
  for (const p of userPicks) {
    picks[p.gameId] = {
      gameId: p.gameId,
      pick: p.pick,
      isConfidenceBet: p.isConfidenceBet,
    };
  }

  return json(200, { stats: computeUserStats(games, picks) });
}

async function handleAdmin(path: string, event: HandlerEvent) {
  const { user } = await requireUser(event);
  if (!user.isAdmin) return json(403, { error: "Admin only" });
  const db = getDb();

  if (path === "admin/sync" && event.httpMethod === "POST") {
    const body = JSON.parse(event.body ?? "{}") as { seasonType?: number; week?: number };
    const result = await syncEspnWeek(body.seasonType, body.week);
    return json(200, result);
  }

  const body = JSON.parse(event.body ?? "{}") as {
    action?: string;
    userId?: string;
    registrationOpen?: boolean;
  };

  if (body.action === "ban" && body.userId) {
    await db.update(schema.users).set({ isBanned: true }).where(eq(schema.users.id, body.userId));
    return json(200, { ok: true });
  }

  if (body.action === "unban" && body.userId) {
    await db.update(schema.users).set({ isBanned: false }).where(eq(schema.users.id, body.userId));
    return json(200, { ok: true });
  }

  if (body.action === "registration" && typeof body.registrationOpen === "boolean") {
    const [settings] = await db.select().from(schema.siteSettings).limit(1);
    if (!settings) {
      await db.insert(schema.siteSettings).values({ registrationOpen: body.registrationOpen });
    } else {
      await db
        .update(schema.siteSettings)
        .set({ registrationOpen: body.registrationOpen })
        .where(eq(schema.siteSettings.id, 1));
    }
    return json(200, { ok: true });
  }

  if (event.httpMethod === "GET") {
    const users = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        isBanned: schema.users.isBanned,
        isAdmin: schema.users.isAdmin,
      })
      .from(schema.users)
      .where(ne(schema.users.id, user.id));
    const [settings] = await db.select().from(schema.siteSettings).limit(1);
    return json(200, { users, registrationOpen: settings?.registrationOpen ?? true });
  }

  return json(400, { error: "Invalid action" });
}

export const handler: Handler = async (event) => {
  try {
    const rawPath = event.path
      .replace(/^\/\.netlify\/functions\/api\/?/, "")
      .replace(/^\/api\/?/, "")
      .replace(/\/$/, "");
    const path = rawPath || (event.queryStringParameters?.path ?? "");

    if (path === "games" && event.httpMethod === "GET") return handleGames(event);
    if (path.startsWith("calendar")) return handleCalendar(path, event);

    if (!hasDatabase()) {
      return json(503, {
        error: "Database not configured",
        hint: "Set DATABASE_URL for API features",
      });
    }

    if (path.startsWith("auth")) return handleAuth(path, event);
    if (path === "picks/week" && event.httpMethod === "GET") return handleWeekPicks(event);
    if (path === "picks") {
      if (event.httpMethod === "GET") return handleUserPicks(event);
      if (event.httpMethod === "POST") return handlePicks(event);
    }
    if (path === "leaderboard" && event.httpMethod === "GET") return handleLeaderboard(event);
    if (path === "history" && event.httpMethod === "GET") return handleHistory(event);
    if (path === "stats" && event.httpMethod === "GET") return handleStats(event);
    if (path.startsWith("admin")) return handleAdmin(path, event);

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : 400;
    return json(status, { error: message });
  }
};

export const syncHandler: Handler = async () => {
  if (!hasDatabase()) {
    return { statusCode: 503, body: "DATABASE_URL not configured" };
  }
  try {
    const result = await syncEspnWeek();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: err instanceof Error ? err.message : "Sync failed" };
  }
};
