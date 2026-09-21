import type { GameData } from "./types";

function statusRank(status: GameData["status"]): number {
  if (status === "in_progress") return 0;
  if (status === "scheduled") return 1;
  return 2; // final
}

/**
 * Live games first (by kickoff), then upcoming chronologically,
 * then completed games last in the order they kicked off.
 */
export function sortGamesLiveFirstThenChronological<
  T extends { kickoffAt: string; status: GameData["status"] },
>(games: readonly T[]): T[] {
  return [...games].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
  });
}
