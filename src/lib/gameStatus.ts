import type { AtsResult, FavoriteSide, GameData, PickSide } from "@shared/types";
import { computeAtsResult } from "@shared/scoring";
import { computeLineLockAt, hasCompleteLine, isPastLineLock, snapshotLine } from "@shared/lineLock";

export type Venue = FavoriteSide;
export type ResultTone = "win" | "loss" | "push" | null;
export type GradeLabel = "Push" | "Correct" | "Wrong";

/** Postponed / canceled / suspended games stay "scheduled" with an explanatory statusDetail. */
export function isPostponed(game: Pick<GameData, "status" | "statusDetail">): boolean {
  if (game.status !== "scheduled") return false;
  return /postpon|cancel|suspend/i.test(game.statusDetail ?? "");
}

/** favorite/underdog → the team slot (away/home) it refers to. */
export function venueForPick(
  game: Pick<GameData, "favoriteSide">,
  pick: PickSide,
): Venue | null {
  if (!game.favoriteSide) return null;
  if (pick === "favorite") return game.favoriteSide;
  return game.favoriteSide === "home" ? "away" : "home";
}

/** Team slot (away/home) → favorite/underdog. */
export function pickSideForVenue(
  game: Pick<GameData, "favoriteSide">,
  venue: Venue,
): PickSide | null {
  if (!game.favoriteSide) return null;
  return game.favoriteSide === venue ? "favorite" : "underdog";
}

/** ATS result: final grade, or the live "if it ended now" result while in progress. */
export function provisionalAts(game: GameData): AtsResult {
  if (game.status === "final") return game.atsResult ?? null;
  if (
    game.status !== "in_progress" ||
    game.spread == null ||
    !game.favoriteSide ||
    game.awayScore == null ||
    game.homeScore == null
  ) {
    return null;
  }
  return computeAtsResult(game.homeScore, game.awayScore, game.spread, game.favoriteSide);
}

export function gradeLabelForPick(pick: PickSide | null, ats: AtsResult): GradeLabel | null {
  if (!pick || !ats) return null;
  if (ats === "push") return "Push";
  return pick === ats ? "Correct" : "Wrong";
}

export function toneForPick(pick: PickSide | null, ats: AtsResult): ResultTone {
  if (!pick || !ats) return null;
  if (ats === "push") return "push";
  return pick === ats ? "win" : "loss";
}

/** Did this team (away/home) cover the spread? Uses the live ATS result while in progress. */
export function venueAtsTone(game: GameData, venue: Venue, ats: AtsResult = provisionalAts(game)): ResultTone {
  const side = pickSideForVenue(game, venue);
  return toneForPick(side, ats);
}

/** Week-level line status for the Picks page. */
export function weekLineLock(games: GameData[]) {
  const lockAt = computeLineLockAt(games.map((g) => g.kickoffAt));
  const pastLock = isPastLineLock(lockAt);
  return {
    lockAt,
    pastLock,
    linesLocked: pastLock && games.some((g) => hasCompleteLine(snapshotLine(g))),
  };
}

/** Compact ET label, e.g. "Wed 8:00 AM ET". */
export function shortLockLabel(lockAt: Date): string {
  const s = lockAt.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${s} ET`;
}
