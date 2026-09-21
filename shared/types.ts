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
  /** Overall W-L(-T) from ESPN, e.g. "2-0" or "1-1-1". */
  awayRecord?: string | null;
  homeRecord?: string | null;
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
  /** ESPN period (1–4 regulation, 5+ OT). */
  period?: number | null;
  /** Clock string from ESPN, e.g. "4:12". */
  displayClock?: string | null;
  /** Short status label, e.g. "Halftime", "End of 2nd", "OT". */
  statusDetail?: string | null;
  /** Score snapshot when OT first detected — used for OT Hero badge. */
  preOtAwayScore?: number | null;
  preOtHomeScore?: number | null;
  weekNumber: number;
  seasonType: number;
  phase: WeekPhase;
}

export interface EarnedBadge {
  badgeId: string;
  name: string;
  description: string;
  seasonType: number | null;
  weekNumber: number | null;
  earnedAt: string;
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
  displayName: string;
  winPct: number;
  correct: number;
  total: number;
  /** ★-only graded record (for Confidence P/L mode). */
  confCorrect: number;
  confTotal: number;
  confidencePl: number;
  weeksComplete: number;
  badges?: EarnedBadge[];
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
  /** NFL abbrev for the picked team (for team-color borders), when a pick exists. */
  pickTeamAbbrev: string | null;
  isConfidenceBet: boolean;
  resultDisplay: string | null;
  outcome: "win" | "loss" | "push" | "pending" | "no_pick";
  unitsDelta: number;
}

export interface WeekComparePick {
  pick: PickSide;
  isConfidenceBet: boolean;
}

export interface WeekComparePlayer {
  userId: string;
  username: string;
  displayName: string;
  picks: Record<string, WeekComparePick>;
}

export interface WeekCompareResponse {
  games: GameData[];
  players: WeekComparePlayer[];
  seasonType: number;
  week: number;
}

export const CONFIDENCE_BETS_PER_WEEK = 5;
/** Fallback slate when ESPN calendar detect fails: regular season Week 1. */
export const DEFAULT_SEASON_TYPE = 2;
export const DEFAULT_WEEK = 1;
