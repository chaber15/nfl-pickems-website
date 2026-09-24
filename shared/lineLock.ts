import type { FavoriteSide, GameData } from "./types";
import { computeAtsResult } from "./scoring.ts";

export const LINE_LOCK_TIMEZONE = "America/New_York";
/** Wednesday = 3 (Sun=0) */
const WEDNESDAY = 3;
const LOCK_HOUR = 8;
const LOCK_MINUTE = 0;

export type LineSnapshot = {
  spread: number | null;
  favoriteSide: FavoriteSide | null;
  oddsAway: number | null;
  oddsHome: number | null;
};

export function hasCompleteLine(line: LineSnapshot): boolean {
  return (
    line.spread != null &&
    line.favoriteSide != null &&
    line.oddsAway != null &&
    line.oddsHome != null
  );
}

export function snapshotLine(game: Pick<GameData, "spread" | "favoriteSide" | "oddsAway" | "oddsHome">): LineSnapshot {
  return {
    spread: game.spread,
    favoriteSide: game.favoriteSide,
    oddsAway: game.oddsAway,
    oddsHome: game.oddsHome,
  };
}

function regrade(game: GameData): GameData {
  if (
    game.status !== "final" ||
    game.spread == null ||
    !game.favoriteSide ||
    game.awayScore == null ||
    game.homeScore == null
  ) {
    return game;
  }
  return {
    ...game,
    atsResult: computeAtsResult(game.homeScore, game.awayScore, game.spread, game.favoriteSide),
  };
}

function partsInZone(date: Date, timeZone: string) {
  const map = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: weekdayMap[map.weekday!] ?? 0,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const got = partsInZone(new Date(utcMs), timeZone);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, 0);
    const wantAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    utcMs += wantAsUtc - gotAsUtc;
  }
  return new Date(utcMs);
}

/**
 * Line lock = 8:00 AM America/New_York on the Wednesday on/before the week's first kickoff.
 * (Typical NFL week: Thursday opener → that Wednesday morning.)
 */
export function computeLineLockAt(kickoffIsos: string[]): Date | null {
  if (kickoffIsos.length === 0) return null;
  const firstMs = Math.min(...kickoffIsos.map((k) => new Date(k).getTime()));
  if (!Number.isFinite(firstMs)) return null;

  const first = new Date(firstMs);
  const et = partsInZone(first, LINE_LOCK_TIMEZONE);
  const daysSinceWednesday = (et.weekday - WEDNESDAY + 7) % 7;

  const noonUtc = Date.UTC(et.year, et.month - 1, et.day, 17, 0, 0);
  const wednesdayUtc = new Date(noonUtc - daysSinceWednesday * 24 * 60 * 60 * 1000);
  const w = partsInZone(wednesdayUtc, LINE_LOCK_TIMEZONE);

  return zonedWallTimeToUtc(w.year, w.month, w.day, LOCK_HOUR, LOCK_MINUTE, LINE_LOCK_TIMEZONE);
}

export function isPastLineLock(lockAt: Date | null, now = new Date()): boolean {
  return lockAt != null && now.getTime() >= lockAt.getTime();
}

/**
 * Pick'em (0) line: ESPN flags no favorite. Treat home as the nominal favorite with
 * spread 0 so picks are allowed; computeAtsResult(…, 0, "home") grades straight-up
 * and a tie is a push.
 */
export function normalizePickemLine(line: LineSnapshot): LineSnapshot {
  if (line.spread != null && Math.abs(line.spread) < 0.001 && line.favoriteSide == null) {
    return { ...line, spread: 0, favoriteSide: "home" };
  }
  return line;
}

function hasSpreadPair(line: LineSnapshot | null | undefined): boolean {
  return line != null && line.spread != null && line.favoriteSide != null;
}

/**
 * Before Wed 8am ET: take incoming ESPN lines (but never wipe stored values with nulls).
 * After lock: keep a complete stored line forever; if still incomplete, accept updates until complete.
 */
export function shouldRefreshLine(
  existing: LineSnapshot | null | undefined,
  _incoming: LineSnapshot,
  pastLock: boolean,
): boolean {
  if (!pastLock) return true;
  if (existing && hasCompleteLine(existing)) return false;
  return true;
}

/**
 * Merge the stored line with ESPN's incoming line.
 * - spread + favoriteSide move together as a pair (never mix an old favorite with a new number).
 * - Before lock: a complete incoming pair wins, otherwise the stored pair is kept. Juice is
 *   taken field-by-field from incoming, falling back to stored (incoming nulls never wipe).
 * - After lock: a complete stored line is frozen; an incomplete one only fills gaps.
 */
export function resolveLineFields(
  existing: LineSnapshot | null | undefined,
  incomingRaw: LineSnapshot,
  pastLock: boolean,
): LineSnapshot {
  const incoming = normalizePickemLine(incomingRaw);
  const stored = existing ? normalizePickemLine(existing) : null;
  if (!shouldRefreshLine(stored, incoming, pastLock)) {
    return stored!;
  }
  if (!stored) return incoming;

  if (!pastLock) {
    const pair = hasSpreadPair(incoming) ? incoming : hasSpreadPair(stored) ? stored : incoming;
    return {
      spread: pair.spread,
      favoriteSide: pair.favoriteSide,
      oddsAway: incoming.oddsAway ?? stored.oddsAway,
      oddsHome: incoming.oddsHome ?? stored.oddsHome,
    };
  }

  // After lock but incomplete: fill gaps from incoming, prefer stored non-nulls once set.
  const pair = hasSpreadPair(stored) ? stored : hasSpreadPair(incoming) ? incoming : stored;
  return {
    spread: pair.spread,
    favoriteSide: pair.favoriteSide,
    oddsAway: stored.oddsAway ?? incoming.oddsAway,
    oddsHome: stored.oddsHome ?? incoming.oddsHome,
  };
}

/**
 * Picks store "favorite"/"underdog", not a team. When the favorite flips home↔away
 * (in practice only before line lock — a complete line is frozen after), stored picks must be
 * swapped so each user keeps the team they tapped.
 */
export function shouldSwapPicksForFavoriteFlip(
  storedFavorite: FavoriteSide | null | undefined,
  resolvedFavorite: FavoriteSide | null | undefined,
): boolean {
  if (storedFavorite == null || resolvedFavorite == null) return false;
  return storedFavorite !== resolvedFavorite;
}

export function mergeGamesWithLineLock(
  games: GameData[],
  stored: Record<string, LineSnapshot>,
  now = new Date(),
): {
  games: GameData[];
  nextStored: Record<string, LineSnapshot>;
  linesLocked: boolean;
  lockAt: Date | null;
} {
  const lockAt = computeLineLockAt(games.map((g) => g.kickoffAt));
  const pastLock = isPastLineLock(lockAt, now);
  const nextStored: Record<string, LineSnapshot> = { ...stored };
  let frozenCount = 0;

  const out = games.map((g) => {
    const key = g.espnEventId || g.id;
    const incoming = snapshotLine(g);
    const existing = nextStored[key];
    const resolved = resolveLineFields(existing, incoming, pastLock);
    nextStored[key] = resolved;

    if (pastLock && hasCompleteLine(resolved)) frozenCount++;

    if (
      resolved.spread === g.spread &&
      resolved.favoriteSide === g.favoriteSide &&
      resolved.oddsAway === g.oddsAway &&
      resolved.oddsHome === g.oddsHome
    ) {
      return g;
    }

    return regrade({
      ...g,
      spread: resolved.spread,
      favoriteSide: resolved.favoriteSide,
      oddsAway: resolved.oddsAway,
      oddsHome: resolved.oddsHome,
    });
  });

  return {
    games: out,
    nextStored,
    linesLocked: pastLock && frozenCount > 0,
    lockAt,
  };
}

export function formatLineLockLabel(lockAt: Date): string {
  return lockAt.toLocaleString("en-US", {
    timeZone: LINE_LOCK_TIMEZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
