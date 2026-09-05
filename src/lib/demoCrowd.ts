import type { GameData, PickSide, WeekComparePlayer } from "@shared/types";
import { isCrowdNameVisible } from "./crowdVisibility";

export type CrowdName = { username: string; star: boolean };

export type GameCrowdLean = {
  /** Visible names only (Leaderboard lean checkboxes). */
  away: CrowdName[];
  home: CrowdName[];
  /** Full room counts — every pick counts, even if names are hidden. */
  awayCount: number;
  homeCount: number;
  openCount: number;
};

export function venueForPick(game: GameData, pick: PickSide): "away" | "home" | null {
  if (!game.favoriteSide) return null;
  if (pick === "favorite") return game.favoriteSide;
  return game.favoriteSide === "home" ? "away" : "home";
}

/**
 * Build Away/Home lean for a game.
 * Counts include everyone (except you); name lists only include visible players.
 */
export function crowdLeanForGame(
  game: GameData,
  players: WeekComparePlayer[],
  excludeUsername: string | null,
): GameCrowdLean {
  const away: CrowdName[] = [];
  const home: CrowdName[] = [];
  let awayCount = 0;
  let homeCount = 0;
  let openCount = 0;

  for (const p of players) {
    if (excludeUsername && p.username === excludeUsername) continue;
    const entry = p.picks[game.id];
    if (!entry) {
      openCount++;
      continue;
    }
    const venue = venueForPick(game, entry.pick);
    const row = { username: p.displayName || p.username, star: entry.isConfidenceBet };
    const showName = isCrowdNameVisible(p.username);
    if (venue === "away") {
      awayCount++;
      if (showName) away.push(row);
    } else if (venue === "home") {
      homeCount++;
      if (showName) home.push(row);
    }
  }

  return { away, home, awayCount, homeCount, openCount };
}
