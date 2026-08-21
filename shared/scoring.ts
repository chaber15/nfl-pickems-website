import type { AtsResult, FavoriteSide, GameData, PickSide } from "./types";

export function parseAmericanOdds(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[^0-9+\-.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function unitsDelta(
  pick: PickSide,
  atsResult: AtsResult,
  favoriteSide: FavoriteSide,
  oddsAway: number | null,
  oddsHome: number | null,
): number {
  if (atsResult === "push" || atsResult === null) return 0;

  const odds =
    pick === "favorite"
      ? favoriteSide === "home"
        ? oddsHome
        : oddsAway
      : favoriteSide === "home"
        ? oddsAway
        : oddsHome;

  if (odds == null) return 0;

  const won = pick === atsResult;
  if (won) return odds > 0 ? odds / 100 : 1;
  return odds > 0 ? -1 : -Math.abs(odds / 100);
}

export function pickCorrectness(
  pick: PickSide | null,
  atsResult: AtsResult,
): number {
  if (pick === null || atsResult === null) return 0;
  if (atsResult === "push") return 0.5;
  return pick === atsResult ? 1 : 0;
}

export function computeWinPct(correctSum: number, totalGames: number): number {
  if (totalGames === 0) return 0;
  return (correctSum / totalGames) * 100;
}

export function computeAtsResult(
  homeScore: number,
  awayScore: number,
  spread: number,
  favoriteSide: FavoriteSide,
): AtsResult {
  // `spread` is the absolute line (e.g. 8.5 for -8.5). Favorite covers if they win by more than that.
  const favoriteScore = favoriteSide === "home" ? homeScore : awayScore;
  const underdogScore = favoriteSide === "home" ? awayScore : homeScore;
  const margin = favoriteScore - underdogScore;
  const coverMargin = margin - Math.abs(spread);

  if (Math.abs(coverMargin) < 0.001) return "push";
  return coverMargin > 0 ? "favorite" : "underdog";
}

export function isGameLocked(kickoffAt: string, now = new Date()): boolean {
  return now >= new Date(kickoffAt);
}

export function isPlayoffPhase(phase: GameData["phase"]): boolean {
  return ["wildcard", "divisional", "conf", "superbowl"].includes(phase);
}

export function countConfidenceBets(
  picks: Record<string, { isConfidenceBet?: boolean }>,
): number {
  return Object.values(picks).filter((p) => p.isConfidenceBet).length;
}

/** Regular / preseason: P/L week counts only with exactly 5 ★ bets. Playoffs: always eligible. */
export function weekPlEligible(
  phase: GameData["phase"],
  confidenceCount: number,
  required = 5,
): boolean {
  if (isPlayoffPhase(phase)) return true;
  return confidenceCount === required;
}

/** Only finished games count for win % / P/L. Locked-in-progress games stay pending. */
export function isGradedForStandings(
  game: { status: string; atsResult?: unknown },
): boolean {
  return game.status === "final";
}
