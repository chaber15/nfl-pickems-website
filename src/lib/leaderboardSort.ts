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

/**
 * Display rank for each row of a board already in `sortBoard` order. Rows that tie on the
 * board's score share the rank of the first row in their group (standard competition ranking:
 * 1, 1, 3, …). Win % ties compare `winPct` rounded to 6 decimals; ★ P/L ties compare
 * `confidencePl` within 1e-6. Idle ★ P/L rows get null and are not part of any tie group.
 */
export function boardRanks(sorted: LeaderboardEntry[], mode: BoardMode): (number | null)[] {
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const tied = (a: LeaderboardEntry, b: LeaderboardEntry) =>
    mode === "winPct"
      ? round6(a.winPct) === round6(b.winPct)
      : Math.abs(a.confidencePl - b.confidencePl) < 1e-6;

  const ranks: (number | null)[] = [];
  let prev: LeaderboardEntry | null = null;
  let prevRank = 0;
  sorted.forEach((entry, i) => {
    if (mode === "pl" && isPlIdle(entry)) {
      ranks.push(null);
      return;
    }
    if (prev === null || !tied(prev, entry)) prevRank = i + 1;
    ranks.push(prevRank);
    prev = entry;
  });
  return ranks;
}

/** Weekly ★ P/L tag for a player short of 5 ★: "3/5 ★", or "no ★". Null when all were placed. */
export function weekStarsTag(entry: LeaderboardEntry): string | null {
  // `?? 0`: a CDN-cached response from before this field existed.
  const missed = entry.missedStars ?? 0;
  if (missed <= 0) return null;
  const placed = CONFIDENCE_BETS_PER_WEEK - missed;
  return placed <= 0 ? "no ★" : `${placed}/${CONFIDENCE_BETS_PER_WEEK} ★`;
}
