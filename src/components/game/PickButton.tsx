import type { GameData } from "@shared/types";
import { formatJuice, formatSpread, juiceForSide } from "@shared/pickDisplay";
import { pickSideForVenue, type Venue } from "../../lib/gameStatus";
import { teamLocationName } from "../../lib/teamLogos";

export function PickButton({
  venue,
  game,
  selected,
  disabled,
  busy = false,
  onClick,
}: {
  venue: Venue;
  game: GameData;
  selected: boolean;
  disabled: boolean;
  /** Save in flight: not clickable, but not greyed out either (avoids flicker on every tap). */
  busy?: boolean;
  onClick: () => void;
}) {
  const isFavorite = game.favoriteSide === venue;
  const pickSide = pickSideForVenue(game, venue);
  const abbrev = venue === "away" ? game.awayAbbrev : game.homeAbbrev;
  const location = teamLocationName(abbrev, venue === "away" ? game.awayTeam : game.homeTeam);
  const venueLabel = venue === "away" ? "AWAY" : "HOME";
  const spread =
    game.spread != null && pickSide && game.favoriteSide
      ? formatSpread(game.spread, pickSide, game.favoriteSide)
      : null;
  const juice = pickSide ? formatJuice(juiceForSide(game, pickSide)) : null;

  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-pressed={selected}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-3 py-3 text-center transition-colors transition-transform ${
        selected
          ? "border-[var(--accent-fill)] bg-[var(--accent-fill)] text-[var(--on-fill)]"
          : isFavorite
            ? "border-[var(--accent-blue)] bg-[var(--bg-card)] text-[var(--text-primary)]"
            : "border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)]"
      } ${
        disabled
          ? // Locked: dim only the side you didn't take, so your pick stays readable.
            selected
            ? "cursor-not-allowed"
            : "cursor-not-allowed opacity-60"
          : busy
            ? "cursor-wait"
            : "cursor-pointer active:scale-[0.98]"
      }`}
    >
      <span className={`text-[10px] font-bold tracking-wide ${selected ? "opacity-80" : "text-[var(--text-muted)]"}`}>
        {venueLabel}
        {isFavorite && <span className={selected ? "" : " text-[var(--accent-blue)]"}> · FAV</span>}
      </span>
      <span className="w-full truncate text-sm font-semibold leading-tight">
        {location}
      </span>
      {spread && <span className="font-mono text-base font-bold">{spread}</span>}
      {juice && (
        <span className={`font-mono text-xs ${selected ? "opacity-80" : "text-[var(--text-muted)]"}`}>
          juice {juice}
        </span>
      )}
    </button>
  );
}
