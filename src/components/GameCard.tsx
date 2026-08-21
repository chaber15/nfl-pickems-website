import { Check, X, Star } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { GameData, PickSide, UserPick } from "@shared/types";
import { formatKickoff, formatPick, formatSpread } from "@shared/pickDisplay";
import { isGameLocked } from "@shared/scoring";
import { teamLogoSrc } from "../lib/teamLogos";

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

  const abbrev =
    side === "favorite"
      ? game.favoriteSide === "home"
        ? game.homeAbbrev
        : game.favoriteSide === "away"
          ? game.awayAbbrev
          : ""
      : game.favoriteSide === "home"
        ? game.awayAbbrev
        : game.favoriteSide === "away"
          ? game.homeAbbrev
          : "";

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={reduce || disabled ? undefined : { scale: 0.98 }}
      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
        selected
          ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-white"
          : side === "favorite"
            ? "border-[var(--accent-blue)] bg-[var(--bg-card)] text-[var(--text-primary)]"
            : "border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      {abbrev ? <TeamLogo abbrev={abbrev} name={team} size={36} /> : null}
      <span className="flex min-w-0 flex-col items-start justify-center">
        <span className="text-xs font-bold tracking-wide">{label}</span>
        <span className="truncate text-base font-semibold">{team}</span>
        {spread && <span className="font-mono text-sm">{spread}</span>}
      </span>
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

      {notStarted ? (
        <div className="mb-4 flex items-center justify-center gap-4 sm:gap-6">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamLogo abbrev={game.awayAbbrev} name={game.awayTeam} size={56} />
            <div className="min-w-0 w-full">
              <p className="truncate text-sm font-bold leading-tight">{game.awayAbbrev}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">{game.awayTeam}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span className="font-pixel text-[10px] tracking-widest text-[var(--text-muted)]">VS</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Pre-game</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamLogo abbrev={game.homeAbbrev} name={game.homeTeam} size={56} />
            <div className="min-w-0 w-full">
              <p className="truncate text-sm font-bold leading-tight">{game.homeAbbrev}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">{game.homeTeam}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-3">
            <TeamLogo abbrev={game.awayAbbrev} name={game.awayTeam} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold leading-tight">{game.awayTeam}</p>
              <p className="font-mono text-xs text-[var(--text-muted)]">{game.awayAbbrev}</p>
            </div>
            {showScores && (
              <span className="font-mono text-2xl font-bold tabular-nums">{game.awayScore}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <TeamLogo abbrev={game.homeAbbrev} name={game.homeTeam} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold leading-tight">{game.homeTeam}</p>
              <p className="font-mono text-xs text-[var(--text-muted)]">{game.homeAbbrev} · home</p>
            </div>
            {showScores && (
              <span className="font-mono text-2xl font-bold tabular-nums">{game.homeScore}</span>
            )}
          </div>
        </div>
      )}

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
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded bg-[var(--border-card)]" />
          <div className="h-8 flex-1 rounded bg-[var(--border-card)]" />
        </div>
        <div className="flex items-center gap-3">
          <div className="size-12 rounded bg-[var(--border-card)]" />
          <div className="h-8 flex-1 rounded bg-[var(--border-card)]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="h-14 rounded-2xl bg-[var(--border-card)]" />
        <div className="h-14 rounded-2xl bg-[var(--border-card)]" />
      </div>
    </div>
  );
}
