import type { GameData, PickSide, WeekComparePlayer, WeekComparePick } from "@shared/types";

export type CrowdName = { username: string; star: boolean };

export type GameCrowdLean = {
  away: CrowdName[];
  home: CrowdName[];
  openCount: number;
};

export function venueForPick(game: GameData, pick: PickSide): "away" | "home" | null {
  if (!game.favoriteSide) return null;
  if (pick === "favorite") return game.favoriteSide;
  return game.favoriteSide === "home" ? "away" : "home";
}

/** Fake family picks so demo can preview the under-side lean. */
export function buildDemoPlayers(games: GameData[], you: string | null): WeekComparePlayer[] {
  const names = [you || "you", "dad", "mom", "uncle_joe", "sam"];
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

/** Build Away/Home name lists for a game, excluding the current user. */
export function crowdLeanForGame(
  game: GameData,
  players: WeekComparePlayer[],
  excludeUsername: string | null,
): GameCrowdLean {
  const away: CrowdName[] = [];
  const home: CrowdName[] = [];
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
    if (venue === "away") away.push(row);
    else if (venue === "home") home.push(row);
  }

  return { away, home, openCount };
}
