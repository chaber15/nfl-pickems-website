import { CONFIDENCE_BETS_PER_WEEK, type LeaderboardEntry } from "@shared/types";

export type BoardMode = "winPct" | "pl";

/** Greyed out on the ★ P/L board (no ★ this week / dropped out of the season board). */
export function isPlIdle(entry: LeaderboardEntry): boolean {
  return entry.plStatus === "idle";
}

/**
 * Rows for a board in display order. ★ P/L leaves off players who haven't made a pick yet and
 * pins greyed-out players to the bottom.
 */
export function sortBoard(entries: LeaderboardEntry[], mode: BoardMode): LeaderboardEntry[] {
  if (mode === "winPct") {
    return [...entries].sort((a, b) => b.winPct - a.winPct || b.confidencePl - a.confidencePl);
  }
  return entries
    .filter((e) => e.plStatus !== "off")
    .sort(
      (a, b) =>
        Number(isPlIdle(a)) - Number(isPlIdle(b)) ||
        b.confidencePl - a.confidencePl ||
        b.winPct - a.winPct,
    );
}

/** Weekly ★ P/L tag for a player short of 5 ★: "3/5 ★", or "no ★". Null when all were placed. */
export function weekStarsTag(entry: LeaderboardEntry): string | null {
  // `?? 0`: a CDN-cached response from before this field existed.
  const missed = entry.missedStars ?? 0;
  if (missed <= 0) return null;
  const placed = CONFIDENCE_BETS_PER_WEEK - missed;
  return placed <= 0 ? "no ★" : `${placed}/${CONFIDENCE_BETS_PER_WEEK} ★`;
}
