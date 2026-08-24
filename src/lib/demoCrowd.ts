import type { GameData, PickSide, WeekComparePlayer, WeekComparePick } from "@shared/types";
import { isCrowdNameVisible } from "./crowdVisibility";

export type CrowdName = { username: string; star: boolean };

export type GameCrowdLean = {
  /** Visible names only (Leaderboard “Show on lean”). */
  away: CrowdName[];
  home: CrowdName[];
  /** Full room counts — every pick counts, even if names are hidden. */
  awayCount: number;
  homeCount: number;
  openCount: number;
};

export const DEMO_CROWD_NAMES = ["dad", "mom", "uncle_joe", "sam"] as const;

export function venueForPick(game: GameData, pick: PickSide): "away" | "home" | null {
  if (!game.favoriteSide) return null;
  if (pick === "favorite") return game.favoriteSide;
  return game.favoriteSide === "home" ? "away" : "home";
}

/** Fake family picks so demo can preview the under-side lean. */
export function buildDemoPlayers(games: GameData[], you: string | null): WeekComparePlayer[] {
  const names = [you || "you", ...DEMO_CROWD_NAMES];
  const unique = [...new Set(names)];
  return unique.map((username, ui) => {
    const picks: Record<string, WeekComparePick> = {};
    games.forEach((g, gi) => {
      if (!g.favoriteSide || g.spread == null) return;
      // Leave one person blank on first game to show “still open”
      if (ui === unique.length - 1 && gi === 0) return;
      const pick: PickSide = (ui + gi) % 3 === 0 ? "underdog" : "favorite";
      picks[g.id] = {
        pick,
        isConfidenceBet: gi < 5 && (ui + gi) % 2 === 0,
      };
    });
    return {
      userId: `demo-${username}`,
      username,
      picks,
    };
  });
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
    const row = { username: p.username, star: entry.isConfidenceBet };
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
