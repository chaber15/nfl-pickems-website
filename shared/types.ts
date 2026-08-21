export type PickSide = "favorite" | "underdog";
export type AtsResult = PickSide | "push" | null;
export type FavoriteSide = "home" | "away";
export type WeekPhase = "regular" | "wildcard" | "divisional" | "conf" | "superbowl" | "preseason";

export interface GameData {
  id: string;
  espnEventId: string;
  awayTeam: string;
  awayAbbrev: string;
  homeTeam: string;
  homeAbbrev: string;
  kickoffAt: string;
  spread: number | null;
  favoriteSide: FavoriteSide | null;
  /** Spread juice / vig (American), e.g. -110 — not moneyline */
  oddsAway: number | null;
  oddsHome: number | null;
  atsResult: AtsResult;
  status: "scheduled" | "in_progress" | "final";
  awayScore?: number;
  homeScore?: number;
  weekNumber: number;
  seasonType: number;
  phase: WeekPhase;
}

export interface UserPick {
  gameId: string;
  pick: PickSide | null;
  isConfidenceBet: boolean;
}

export interface StoredPicks {
  username: string;
  weekKey: string;
  picks: Record<string, UserPick>;
  updatedAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  winPct: number;
  correct: number;
  total: number;
  confidencePl: number;
  weeksComplete: number;
}

export interface UserStats {
  winPctAll: number;
  winPctConfidence: number;
  confidencePl: number;
  hypotheticalPl: number;
  confidenceRoi: number;
  hypotheticalRoi: number;
  bestWeekConfidence: { week: number; pl: number } | null;
  worstWeekConfidence: { week: number; pl: number } | null;
  favoritePickRate: number;
  underdogPickRate: number;
  favoriteHitRate: number;
  underdogHitRate: number;
  favoriteUnits: number;
  underdogUnits: number;
  currentStreakAll: number;
  currentStreakConfidence: number;
  weeklyRows: WeeklyStatRow[];
}

export interface WeeklyStatRow {
  weekNumber: number;
  phase: WeekPhase;
  picksMade: number;
  totalGames: number;
  confidenceBets: number;
  winPct: number;
  confidencePl: number;
  hypotheticalPl: number;
  /** False when regular/preseason week has fewer than 5 ★ bets (P/L excluded). */
  plEligible: boolean;
}

export interface HistoryRow {
  gameId: string;
  weekNumber: number;
  matchup: string;
  kickoffAt: string;
  pickDisplay: string | null;
  isConfidenceBet: boolean;
  resultDisplay: string | null;
  outcome: "win" | "loss" | "push" | "pending" | "no_pick";
  unitsDelta: number;
}

export const CONFIDENCE_BETS_PER_WEEK = 5;
export const DEMO_WEEK_KEY = "preseason-2";
export const DEMO_SEASON_TYPE = 1;
export const DEMO_WEEK = 2;
