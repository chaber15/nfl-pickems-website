import { Check, X, Star } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { GameData, PickSide, UserPick } from "@shared/types";
import { formatKickoff, formatMatchup, formatPick, formatSpread } from "@shared/pickDisplay";
import { isGameLocked } from "@shared/scoring";

interface GameCardProps {
  game: GameData;
  userPick?: UserPick;
  onPick: (side: PickSide) => void;
  onToggleConfidence: () => void;
  confidenceDisabled?: boolean;
  forceUnlocked?: boolean;
}

function PickButton({
  side,
  game,
  selected,
  disabled,
  onClick,
}: {
  side: PickSide;
  game: GameData;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();
  const label = side === "favorite" ? "FAVORITE" : "UNDERDOG";
  const team =
    side === "favorite"
      ? game.favoriteSide === "home"
        ? game.homeTeam
        : game.favoriteSide === "away"
          ? game.awayTeam
          : "TBD"
      : game.favoriteSide === "home"
        ? game.awayTeam
        : game.favoriteSide === "away"
          ? game.homeTeam
          : "TBD";
  const spread =
    game.spread != null && game.favoriteSide
      ? formatSpread(game.spread, side, game.favoriteSide)
      : null;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={reduce || disabled ? undefined : { scale: 0.98 }}
      className={`flex min-h-14 w-full flex-col items-start justify-center rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
        selected
          ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-white"
          : side === "favorite"
            ? "border-[var(--accent-blue)] bg-[var(--bg-card)] text-[var(--text-primary)]"
            : "border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span className="text-xs font-bold tracking-wide">{label}</span>
      <span className="text-base font-semibold">{team}</span>
      {spread && <span className="font-mono text-sm">{spread}</span>}
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
  const gradeLabel =
    graded && pick && game.atsResult
      ? game.atsResult === "push"
        ? "Push"
        : pick === game.atsResult
          ? "Correct"
          : "Wrong"
      : null;

  return (
    <motion.article
      layout
      className={`rounded-2xl border-2 bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)] ${
        isConfidence ? "border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]/30" : "border-[var(--border-card)]"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-muted)]">{formatKickoff(game.kickoffAt)}</p>
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

      <h3 className="mb-4 text-lg font-bold">{formatMatchup(game)}</h3>

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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <PickButton
            side="favorite"
            game={game}
            selected={pick === "favorite"}
            disabled={!hasLine}
            onClick={() => onPick("favorite")}
          />
          <PickButton
            side="underdog"
            game={game}
            selected={pick === "underdog"}
            disabled={!hasLine}
            onClick={() => onPick("underdog")}
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
              ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[#1a2e1a]"
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
      <div className="mb-4 h-6 w-48 rounded bg-[var(--border-card)]" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="h-14 rounded-2xl bg-[var(--border-card)]" />
        <div className="h-14 rounded-2xl bg-[var(--border-card)]" />
      </div>
    </div>
  );
}
