import type { GameData } from "./types";

/**
 * Live / in-progress games first (by kickoff), then the rest chronologically.
 * Keeps Monday night on top while it's being played; otherwise TNF → Sunday → SNF/MNF.
 */
export function sortGamesLiveFirstThenChronological<
  T extends { kickoffAt: string; status: GameData["status"] },
>(games: readonly T[]): T[] {
  return [...games].sort((a, b) => {
    const aLive = a.status === "in_progress" ? 0 : 1;
    const bLive = b.status === "in_progress" ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
  });
}
