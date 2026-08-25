import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db";
import { fetchScoreboard, fetchCurrentScoreboard, applyAtsToGame } from "../../shared/espnClient";
import {
  computeLineLockAt,
  isPastLineLock,
  resolveLineFields,
  snapshotLine,
  type LineSnapshot,
} from "../../shared/lineLock";
import type { GameData } from "../../shared/types";

function spreadToCents(spread: number | null): number | null {
  if (spread == null) return null;
  return Math.round(spread * 10);
}

function centsToSpread(cents: number | null): number | null {
  if (cents == null) return null;
  return cents / 10;
}

export function dbGameToGameData(
  game: typeof schema.games.$inferSelect,
  week: typeof schema.weeks.$inferSelect,
): GameData {
  const spread = centsToSpread(game.spread);
  const base: GameData = {
    id: game.espnEventId,
    espnEventId: game.espnEventId,
    awayTeam: game.awayTeam,
    awayAbbrev: game.awayAbbrev,
    homeTeam: game.homeTeam,
    homeAbbrev: game.homeAbbrev,
    kickoffAt: game.kickoffAt.toISOString(),
    spread,
    favoriteSide: game.favoriteSide,
    oddsAway: game.oddsAway,
    oddsHome: game.oddsHome,
    atsResult: game.atsResult,
    status: game.status,
    awayScore: game.awayScore ?? undefined,
    homeScore: game.homeScore ?? undefined,
    weekNumber: week.weekNumber,
    seasonType: week.seasonType,
    phase: week.phase,
  };
  return applyAtsToGame(base);
}

async function ensureSeasonYear(year: number) {
  const db = getDb();
  const [existing] = await db.select().from(schema.seasons).where(eq(schema.seasons.year, year)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.seasons)
    .values({ year, label: `${year} NFL Season` })
    .returning();
  return created;
}

async function ensureWeek(seasonId: string, weekNumber: number, seasonType: number, phase: GameData["phase"]) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.weeks)
    .where(and(eq(schema.weeks.seasonId, seasonId), eq(schema.weeks.weekNumber, weekNumber), eq(schema.weeks.seasonType, seasonType)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.weeks)
    .values({ seasonId, weekNumber, seasonType, phase })
    .returning();
  return created;
}

function existingLineSnapshot(game: typeof schema.games.$inferSelect): LineSnapshot {
  return {
    spread: centsToSpread(game.spread),
    favoriteSide: game.favoriteSide,
    oddsAway: game.oddsAway,
    oddsHome: game.oddsHome,
  };
}

export async function syncEspnWeek(seasonType?: number, week?: number) {
  const board =
    seasonType != null && week != null
      ? await fetchScoreboard(seasonType, week)
      : await fetchCurrentScoreboard();

  const db = getDb();
  const year = new Date().getFullYear();
  const season = await ensureSeasonYear(year);

  const [settings] = await db.select().from(schema.siteSettings).limit(1);
  if (!settings) {
    await db.insert(schema.siteSettings).values({ currentSeasonId: season.id });
  } else if (!settings.currentSeasonId) {
    await db.update(schema.siteSettings).set({ currentSeasonId: season.id }).where(eq(schema.siteSettings.id, 1));
  }

  const weekRow = await ensureWeek(season.id, board.week, board.seasonType, board.games[0]?.phase ?? "regular");
  const lockAt = computeLineLockAt(board.games.map((g) => g.kickoffAt));
  const pastLock = isPastLineLock(lockAt);

  let upserted = 0;
  for (const g of board.games) {
    const [existing] = await db.select().from(schema.games).where(eq(schema.games.espnEventId, g.espnEventId)).limit(1);
    const incoming = snapshotLine(g);
    const existingSnap = existing ? existingLineSnapshot(existing) : null;
    const lockedLine = resolveLineFields(existingSnap, incoming, pastLock);
    const graded = applyAtsToGame({
      ...g,
      spread: lockedLine.spread,
      favoriteSide: lockedLine.favoriteSide,
      oddsAway: lockedLine.oddsAway,
      oddsHome: lockedLine.oddsHome,
    });

    const values = {
      weekId: weekRow.id,
      espnEventId: graded.espnEventId,
      awayTeam: graded.awayTeam,
      awayAbbrev: graded.awayAbbrev,
      homeTeam: graded.homeTeam,
      homeAbbrev: graded.homeAbbrev,
      kickoffAt: new Date(graded.kickoffAt),
      spread: spreadToCents(graded.spread),
      favoriteSide: graded.favoriteSide,
      oddsAway: graded.oddsAway,
      oddsHome: graded.oddsHome,
      atsResult: graded.atsResult === null ? null : graded.atsResult,
      status: graded.status,
      awayScore: graded.awayScore ?? null,
      homeScore: graded.homeScore ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(schema.games).set(values).where(eq(schema.games.id, existing.id));
    } else {
      await db.insert(schema.games).values(values);
    }
    upserted++;
  }

  return {
    upserted,
    week: board.week,
    seasonType: board.seasonType,
    linesLocked: pastLock,
    lockAt: lockAt?.toISOString() ?? null,
  };
}

export async function getGamesForWeek(seasonType: number, weekNumber: number): Promise<GameData[]> {
  const db = getDb();
  const rows = await db
    .select({ game: schema.games, week: schema.weeks })
    .from(schema.games)
    .innerJoin(schema.weeks, eq(schema.games.weekId, schema.weeks.id))
    .where(and(eq(schema.weeks.seasonType, seasonType), eq(schema.weeks.weekNumber, weekNumber)));

  return rows.map(({ game, week }) => dbGameToGameData(game, week));
}
