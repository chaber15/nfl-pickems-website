import { fetchScoreboard } from "@shared/espnClient";
import { formatLineLockLabel, mergeGamesWithLineLock, type LineSnapshot } from "@shared/lineLock";
import type { GameData } from "@shared/types";
import { getStoredLines, saveStoredLines } from "./localStorage";

export type WeekGamesResult = {
  games: GameData[];
  seasonType: number;
  week: number;
  linesLocked: boolean;
  lockAt: Date | null;
  lockLabel: string | null;
};

/** ESPN fetch + Wednesday 8am ET line freeze (demo / client cache). */
export async function loadWeekGames(seasonType: number, week: number, weekKey: string): Promise<WeekGamesResult> {
  const board = await fetchScoreboard(seasonType, week);
  const stored = getStoredLines(weekKey);
  const { games, nextStored, linesLocked, lockAt } = mergeGamesWithLineLock(board.games, stored);
  saveStoredLines(weekKey, nextStored, lockAt);
  return {
    games,
    seasonType: board.seasonType,
    week: board.week,
    linesLocked,
    lockAt,
    lockLabel: lockAt ? formatLineLockLabel(lockAt) : null,
  };
}

export function lineLockSummary(games: GameData[], stored: Record<string, LineSnapshot> = {}) {
  const { linesLocked, lockAt } = mergeGamesWithLineLock(games, stored);
  return {
    linesLocked,
    lockAt,
    lockLabel: lockAt ? formatLineLockLabel(lockAt) : null,
  };
}
