import type { FavoriteSide, GameData, PickSide } from "./types";

export function formatSpread(spread: number, side: PickSide, _favoriteSide: FavoriteSide): string {
  const isFavorite = side === "favorite";
  const sign = isFavorite ? "-" : "+";
  const value = Math.abs(spread);
  return `${sign}${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}`;
}

/** American juice / vig, e.g. -110 or +105 */
export function formatJuice(odds: number | null | undefined): string | null {
  if (odds == null || !Number.isFinite(odds)) return null;
  const n = Math.round(odds);
  return n > 0 ? `+${n}` : `${n}`;
}

export function juiceForSide(
  game: Pick<GameData, "oddsAway" | "oddsHome" | "favoriteSide">,
  side: PickSide,
): number | null {
  if (!game.favoriteSide) return null;
  if (side === "favorite") {
    return game.favoriteSide === "home" ? game.oddsHome : game.oddsAway;
  }
  return game.favoriteSide === "home" ? game.oddsAway : game.oddsHome;
}


export function teamForSide(game: Pick<GameData, "awayTeam" | "homeTeam" | "favoriteSide">, side: PickSide): string {
  if (!game.favoriteSide) return side === "favorite" ? "Favorite" : "Underdog";
  if (side === "favorite") {
    return game.favoriteSide === "home" ? game.homeTeam : game.awayTeam;
  }
  return game.favoriteSide === "home" ? game.awayTeam : game.homeTeam;
}

export function abbrevForSide(
  game: Pick<GameData, "awayAbbrev" | "homeAbbrev" | "favoriteSide">,
  side: PickSide,
): string {
  if (!game.favoriteSide) return side === "favorite" ? "FAV" : "DOG";
  if (side === "favorite") {
    return game.favoriteSide === "home" ? game.homeAbbrev : game.awayAbbrev;
  }
  return game.favoriteSide === "home" ? game.awayAbbrev : game.homeAbbrev;
}

export function formatPick(
  game: Pick<GameData, "awayTeam" | "homeTeam" | "favoriteSide" | "spread">,
  pick: PickSide,
): string {
  const sideLabel = pick === "favorite" ? "Favorite" : "Underdog";
  const team = teamForSide(game, pick);
  if (game.spread == null || !game.favoriteSide) {
    return `${sideLabel} - ${team}`;
  }
  const spreadStr = formatSpread(game.spread, pick, game.favoriteSide);
  return `${sideLabel} - ${team} ${spreadStr}`;
}

export function formatMatchup(game: Pick<GameData, "awayAbbrev" | "homeAbbrev">): string {
  return `${game.awayAbbrev} @ ${game.homeAbbrev}`;
}

export function formatKickoff(kickoffAt: string): string {
  const d = new Date(kickoffAt);
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatResult(game: GameData): string | null {
  if (!game.atsResult || game.atsResult === "push") {
    if (game.atsResult === "push") return "Push";
    return null;
  }
  return `${formatPick(game, game.atsResult)} covered`;
}

export function tickerLine(game: GameData): string {
  if (game.spread == null || !game.favoriteSide) {
    return `${game.awayAbbrev} @ ${game.homeAbbrev}`;
  }
  const favAbbrev = game.favoriteSide === "home" ? game.homeAbbrev : game.awayAbbrev;
  const dogAbbrev = game.favoriteSide === "home" ? game.awayAbbrev : game.homeAbbrev;
  const spreadStr = formatSpread(game.spread, "favorite", game.favoriteSide);
  const score =
    game.status === "final" && game.awayScore != null && game.homeScore != null
      ? ` ${game.awayScore}-${game.homeScore}`
      : "";
  return `${dogAbbrev} vs ${favAbbrev} ${spreadStr}${score}`;
}
