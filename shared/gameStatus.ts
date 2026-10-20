import type { GameData } from "./types";

/** Postponed / canceled / suspended games stay "scheduled" with an explanatory statusDetail. */
export function isPostponed(game: Pick<GameData, "status" | "statusDetail">): boolean {
  if (game.status !== "scheduled") return false;
  return /postpon|cancel|suspend/i.test(game.statusDetail ?? "");
}
