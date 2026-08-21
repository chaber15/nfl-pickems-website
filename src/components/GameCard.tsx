import { Check, X, Star } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { FavoriteSide, GameData, PickSide, UserPick } from "@shared/types";
import { formatKickoff, formatPick, formatSpread, formatJuice, juiceForSide } from "@shared/pickDisplay";
import { isGameLocked } from "@shared/scoring";
import { teamLogoSrc, teamLocationName } from "../lib/teamLogos";

type Venue = FavoriteSide;

function TeamLogo({ abbrev, name, size = 40 }: { abbrev: string; name: string; size?: number }) {
  const src = teamLogoSrc(abbrev);
  if (!src) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--bg-card-elevated)] font-mono text-xs font-bold"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {abbrev.slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      title={name}
    />
  );
}

function pickSideForVenue(favoriteSide: FavoriteSide | null, venue: Venue): PickSide | null {
  if (!favoriteSide) return null;
  return favoriteSide === venue ? "favorite" : "underdog";
}

interface GameCardProps {
  game: GameData;
  userPick?: UserPick;
  onPick: (side: PickSide) => void;
  onToggleConfidence: () => void;
  confidenceDisabled?: boolean;
  forceUnlocked?: boolean;
}

function PickButton({
  venue,
  game,
  selected,
  disabled,
  onClick,
}: {
  venue: Venue;
  game: GameData;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();
  const isFavorite = game.favoriteSide === venue;
  const pickSide = pickSideForVenue(game.favoriteSide, venue);
  const abbrev = venue === "away" ? game.awayAbbrev : game.homeAbbrev;
  const location = teamLocationName(abbrev, venue === "away" ? game.awayTeam : game.homeTeam);
  const venueLabel = venue === "away" ? "AWAY" : "HOME";
  const spread =
    game.spread != null && pickSide && game.favoriteSide
      ? formatSpread(game.spread, pickSide, game.favoriteSide)
      : null;
  const juice = pickSide ? formatJuice(juiceForSide(game, pickSide)) : null;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={reduce || disabled ? undefined : { scale: 0.98 }}
      className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-3 py-3 text-center transition-colors ${
        selected
          ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-[var(--accent-on-green)]"
          : isFavorite
            ? "border-[var(--accent-blue)] bg-[var(--bg-card)] text-[var(--text-primary)]"
            : "border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span className={`text-[10px] font-bold tracking-wide ${selected ? "opacity-80" : "text-[var(--text-muted)]"}`}>
        {venueLabel}
        {isFavorite && (
          <span className={selected ? "" : " text-[var(--accent-blue)]"}> · FAV</span>
        )}
      </span>
      <span className="w-full truncate text-sm font-semibold leading-tight">{location}</span>
      {spread && <span className="font-mono text-base font-bold">{spread}</span>}
      {juice && (
        <span className={`font-mono text-xs ${selected ? "opacity-80" : "text-[var(--text-muted)]"}`}>
          juice {juice}
        </span>
      )}
    </motion.button>
  );
}

export function GameCard({ game, userPick, onPick, onToggleConfidence, confidenceDisabled, forceUnlocked }: GameCardProps) {
  const locked = isGameLocked(game.kickoffAt) && !forceUnlocked;
  const hasLine = game.spread != null && game.favoriteSide;
  const pick = userPick?.pick ?? null;
  const isConfidence = userPick?.isConfidenceBet ?? false;
  const isPlayoff = ["wildcard", "divisional", "conf", "superbowl"].includes(game.phase);
  const graded = game.status === "final" && game.atsResult;
  const notStarted = game.status === "scheduled";
  const showScores = !notStarted && game.awayScore != null && game.homeScore != null;
  const awayPick = pickSideForVenue(game.favoriteSide, "away");
  const homePick = pickSideForVenue(game.favoriteSide, "home");
  const gradeLabel =
    graded && pick && game.atsResult
      ? game.atsResult === "push"
        ? "Push"
        : pick === game.atsResult
          ? "Correct"
          : "Wrong"
      : null;

  const onPickVenue = (venue: Venue) => {
    const side = pickSideForVenue(game.favoriteSide, venue);
    if (side) onPick(side);
  };

  return (
    <motion.article
      layout
      className={`rounded-2xl border-2 bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)] ${
        isConfidence ? "border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]/30" : "border-[var(--border-card)]"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-muted)]">{formatKickoff(game.kickoffAt)}</p>
        <div className="flex flex-wrap items-center gap-2">
          {notStarted && (
            <span className="rounded-full border-2 border-dashed border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-3 py-1 text-xs font-bold tracking-wide text-[var(--text-muted)]">
              NOT STARTED
            </span>
          )}
          {game.status === "in_progress" && (
            <span className="rounded-full bg-[var(--accent-red)]/15 px-3 py-1 text-xs font-bold text-[var(--accent-red)]">
              LIVE
            </span>
          )}
          {game.status === "final" && !gradeLabel && (
            <span className="rounded-full bg-[var(--bg-card-elevated)] px-3 py-1 text-xs font-bold text-[var(--text-muted)]">
              FINAL
            </span>
          )}
          {locked && !pick && (
            <span className="rounded-full bg-[var(--accent-red)]/15 px-3 py-1 text-xs font-bold text-[var(--accent-red)]">
              NO PICK
            </span>
          )}
          {gradeLabel && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                gradeLabel === "Correct"
                  ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
                  : gradeLabel === "Push"
                    ? "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
                    : "bg-[var(--accent-red)]/15 text-[var(--accent-red)]"
              }`}
            >
              {gradeLabel === "Wrong" ? <X size={14} weight="bold" /> : <Check size={14} weight="bold" />}
              {gradeLabel}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-center gap-3 sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
          <TeamLogo abbrev={game.awayAbbrev} name={game.awayTeam} size={showScores ? 44 : 56} />
          <p className="w-full truncate text-sm font-bold leading-tight">{game.awayTeam}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {game.awayAbbrev}
            {showScores ? "" : " · away"}
          </p>
          {showScores && (
            <span className="font-mono text-2xl font-bold tabular-nums">{game.awayScore}</span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1 px-1">
          <span className="font-display text-2xl text-[var(--text-muted)]">@</span>
          {notStarted && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Pre-game</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
          <TeamLogo abbrev={game.homeAbbrev} name={game.homeTeam} size={showScores ? 44 : 56} />
          <p className="w-full truncate text-sm font-bold leading-tight">{game.homeTeam}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {game.homeAbbrev}
            {showScores ? "" : " · home"}
          </p>
          {showScores && (
            <span className="font-mono text-2xl font-bold tabular-nums">{game.homeScore}</span>
          )}
        </div>
      </div>

      {!hasLine && !locked && (
        <p className="mb-4 rounded-2xl border-2 border-dashed border-[var(--border-card)] px-4 py-3 text-sm text-[var(--text-muted)]">
          Line not posted yet
        </p>
      )}

      {locked && pick && (
        <p className="mb-4 rounded-2xl bg-[var(--bg-card-elevated)] px-4 py-3 text-sm font-semibold">
          Your pick: {formatPick(game, pick)}
        </p>
      )}

      {locked && !pick && (
        <p className="mb-4 rounded-2xl bg-[var(--accent-red)]/10 px-4 py-3 text-sm font-bold text-[var(--accent-red)]">
          NO PICK - counts as wrong
        </p>
      )}

      {!locked && (
        <div className="grid grid-cols-2 gap-3">
          <PickButton
            venue="away"
            game={game}
            selected={awayPick != null && pick === awayPick}
            disabled={!hasLine || awayPick == null}
            onClick={() => onPickVenue("away")}
          />
          <PickButton
            venue="home"
            game={game}
            selected={homePick != null && pick === homePick}
            disabled={!hasLine || homePick == null}
            onClick={() => onPickVenue("home")}
          />
        </div>
      )}

      {!locked && hasLine && !isPlayoff && (
        <button
          type="button"
          disabled={!pick || confidenceDisabled}
          onClick={onToggleConfidence}
          className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 px-4 text-sm font-bold transition-colors ${
            isConfidence
              ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[#0e1116]"
              : "border-[var(--accent-gold)] bg-transparent text-[var(--text-primary)]"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Star size={18} weight={isConfidence ? "fill" : "bold"} />
          {isConfidence ? "CONFIDENCE BET" : "MARK AS BET"}
        </button>
      )}

      {!pick && !locked && hasLine && (
        <p className="mt-3 text-xs font-medium text-[var(--accent-red)]">
          No pick yet - counts as wrong at kickoff
        </p>
      )}
    </motion.article>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 h-4 w-32 rounded bg-[var(--border-card)]" />
      <div className="mb-4 flex items-center justify-center gap-4">
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="size-14 rounded bg-[var(--border-card)]" />
          <div className="h-4 w-20 rounded bg-[var(--border-card)]" />
        </div>
        <div className="h-6 w-6 rounded bg-[var(--border-card)]" />
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="size-14 rounded bg-[var(--border-card)]" />
          <div className="h-4 w-20 rounded bg-[var(--border-card)]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl bg-[var(--border-card)]" />
        <div className="h-28 rounded-2xl bg-[var(--border-card)]" />
      </div>
    </div>
  );
}
