import { CONFIDENCE_BETS_PER_WEEK, type AtsResult, type FavoriteSide, type GameData, type PickSide } from "./types";

const EVEN_ODDS_TOKENS = new Set(["EVEN", "EV", "EVS", "EVENS", "PK", "PICK", "PICKEM", "PICK'EM"]);

/**
 * Parse American odds ("-110", "+120", -115, "EVEN") into a number.
 * "EVEN"/"EV"/"PK" → +100. Empty, garbage, or impossible values (|odds| < 100) → null,
 * never 0 — a 0 would make a losing ★ bet cost nothing.
 */
export function parseAmericanOdds(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && Math.abs(value) >= 100 ? value : null;
  }
  const s = value.trim().toUpperCase();
  if (!s) return null;
  if (EVEN_ODDS_TOKENS.has(s)) return 100;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
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

/**
 * ★ bets a regular / preseason week is short of the required 5. Each one costs
 * `missedStarCost(week's games)` once the week is closed (see `isWeekClosed`).
 * Playoffs: always 0 — every pick counts.
 */
export function missedStars(
  phase: GameData["phase"],
  confidenceCount: number,
  required = CONFIDENCE_BETS_PER_WEEK,
): number {
  if (isPlayoffPhase(phase)) return 0;
  return Math.max(0, required - confidenceCount);
}

/** Units lost on a losing bet at these American odds: −115 → 1.15, +102 → 1. */
function lossAtOdds(odds: number | null): number | null {
  if (odds == null) return null;
  return odds > 0 ? 1 : Math.abs(odds) / 100;
}

/** A standard −110 loss, for a week with no juice posted on any game. */
const STANDARD_LOSS = 1.1;

/**
 * What one missing ★ costs: a loss at the worst price on the board that week (the side that
 * risks the most, usually −115 to −122). Never cheaper than a ★ you could have placed and lost.
 */
export function missedStarCost(
  games: Array<{ spread: number | null; oddsAway: number | null; oddsHome: number | null }>,
): number {
  let worst: number | null = null;
  for (const g of games) {
    if (g.spread == null) continue;
    for (const loss of [lossAtOdds(g.oddsAway), lossAtOdds(g.oddsHome)]) {
      if (loss != null && (worst == null || loss > worst)) worst = loss;
    }
  }
  return worst ?? STANDARD_LOSS;
}

/** A week is closed once every game has kicked off — no more ★ can be placed. */
export function isWeekClosed(
  games: Array<{ status: string; kickoffAt: string }>,
  now = new Date(),
): boolean {
  return games.length > 0 && games.every((g) => g.status !== "scheduled" || isGameLocked(g.kickoffAt, now));
}

/**
 * Only finished games with an ATS grade count for win % / P/L. Locked in-progress games
 * stay pending; final games with no line (atsResult null) are excluded, not losses.
 */
export function isGradedForStandings(
  game: { status: string; atsResult?: unknown },
): boolean {
  return game.status === "final" && game.atsResult != null;
}
