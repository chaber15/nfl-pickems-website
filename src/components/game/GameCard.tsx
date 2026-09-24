import { Star } from "../icons";
import type { GameData, PickSide, UserPick } from "@shared/types";
import { formatKickoff, formatPick } from "@shared/pickDisplay";
import { hasCompleteLine, snapshotLine } from "@shared/lineLock";
import { isGameLocked, isPlayoffPhase } from "@shared/scoring";
import type { GameCrowdLean } from "../../lib/crowdLean";
import {
  gradeLabelForPick,
  isPostponed,
  pickSideForVenue,
  provisionalAts,
  shortLockLabel,
  toneForPick,
  venueAtsTone,
  venueForPick,
  type Venue,
} from "../../lib/gameStatus";
import { toneBorder } from "../../lib/tone";
import { CrowdLean } from "./CrowdLean";
import { PickButton } from "./PickButton";
import { StatusPills } from "./StatusPills";
import { TeamPanel } from "./TeamPanel";
import { useEstimatedClock } from "./useEstimatedClock";

interface GameCardProps {
  game: GameData;
  userPick?: UserPick;
  onPick: (side: PickSide) => void;
  /** Explicit ★ value to save (never a blind toggle). */
  onSetConfidence: (value: boolean) => void;
  confidenceDisabled?: boolean;
  crowd?: GameCrowdLean;
  /** Desktop: open names to fill row height when paired with a taller open-picks card. */
  expandCrowdNames?: boolean;
  /** A save for this card is in flight — its buttons are disabled. */
  saving?: boolean;
  /** Last save error for this card (cleared on the next success). */
  error?: string | null;
  /** When the week's lines freeze (Wed 8:00 AM ET); null if unknown. */
  lineLockAt?: Date | null;
  lineLockPassed?: boolean;
}

export function GameCard({
  game,
  userPick,
  onPick,
  onSetConfidence,
  confidenceDisabled,
  crowd,
  expandCrowdNames = false,
  saving = false,
  error = null,
  lineLockAt = null,
  lineLockPassed = false,
}: GameCardProps) {
  const locked = isGameLocked(game.kickoffAt);
  const postponed = isPostponed(game);
  const hasLine = game.spread != null && game.favoriteSide != null;
  const pick = userPick?.pick ?? null;
  const isConfidence = userPick?.isConfidenceBet ?? false;
  const isPlayoff = isPlayoffPhase(game.phase);
  const showScores = game.status !== "scheduled" && game.awayScore != null && game.homeScore != null;
  const liveLabel = useEstimatedClock(game);
  const ats = provisionalAts(game);
  const gradeLabel = gradeLabelForPick(pick, game.status === "final" ? game.atsResult : null);
  const resultTone = toneForPick(pick, ats);
  const pickVenue = pick ? venueForPick(game, pick) : null;
  const fillMatchup = locked || showScores;
  const awayPick = pickSideForVenue(game, "away");
  const homePick = pickSideForVenue(game, "home");

  const onPickVenue = (venue: Venue) => {
    const side = pickSideForVenue(game, venue);
    if (side && !saving) onPick(side);
  };

  const lineNote = !hasLine
    ? null
    : lineLockPassed && hasCompleteLine(snapshotLine(game))
      ? "Line locked"
      : lineLockAt && !lineLockPassed
        ? `Line not final — locks ${shortLockLabel(lineLockAt)}`
        : null;

  return (
    <article
      aria-busy={saving || undefined}
      className={`flex h-full flex-col rounded-2xl border-2 bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)] ${toneBorder(resultTone)}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-muted)]">{formatKickoff(game.kickoffAt)}</p>
        <StatusPills game={game} liveLabel={liveLabel} gradeLabel={gradeLabel} liveTone={resultTone} />
      </div>

      <div
        className={`mb-4 flex gap-2 sm:gap-3 ${fillMatchup ? "items-stretch" : "items-center justify-center gap-3 sm:gap-4"}`}
      >
        <TeamPanel
          game={game}
          venue="away"
          showScores={showScores}
          fillMatchup={fillMatchup}
          atsTone={venueAtsTone(game, "away", ats)}
          picked={pickVenue === "away"}
        />
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-0.5">
          <span className="font-display text-2xl text-[var(--text-muted)]">@</span>
        </div>
        <TeamPanel
          game={game}
          venue="home"
          showScores={showScores}
          fillMatchup={fillMatchup}
          atsTone={venueAtsTone(game, "home", ats)}
          picked={pickVenue === "home"}
        />
      </div>

      {!hasLine && !locked && (
        <p className="mb-4 rounded-2xl border-2 border-dashed border-[var(--border-card)] px-4 py-3 text-sm text-[var(--text-muted)]">
          Line not posted yet
        </p>
      )}

      {locked && pick && (
        <p className="mb-4 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-4 py-3 text-sm font-bold sm:font-semibold">
          Your pick: {formatPick(game, pick)}
          {isConfidence && <Star size={14} weight="fill" className="ml-1 inline text-[var(--accent-gold)]" />}
        </p>
      )}

      {locked && !pick && postponed && (
        <p className="mb-4 rounded-2xl bg-[var(--accent-gold)]/10 px-4 py-3 text-sm font-bold text-[var(--accent-gold)]">
          {game.statusDetail} — not graded
        </p>
      )}

      {locked && !pick && !postponed && (
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
            busy={saving}
            onClick={() => onPickVenue("away")}
          />
          <PickButton
            venue="home"
            game={game}
            selected={homePick != null && pick === homePick}
            disabled={!hasLine || homePick == null}
            busy={saving}
            onClick={() => onPickVenue("home")}
          />
        </div>
      )}

      {!locked && lineNote && (
        <p className="mt-2 text-center text-[11px] font-semibold text-[var(--text-muted)]">{lineNote}</p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-3 py-2 text-sm font-semibold text-[var(--accent-red)]"
        >
          {error}
        </p>
      )}

      {crowd && <CrowdLean crowd={crowd} game={game} expandByDefault={expandCrowdNames} />}

      {!locked && hasLine && !isPlayoff && (
        <button
          type="button"
          disabled={!pick || confidenceDisabled || saving}
          aria-pressed={isConfidence}
          onClick={() => onSetConfidence(!isConfidence)}
          className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 px-4 text-sm font-bold transition-colors ${
            isConfidence
              ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[#0e1116]"
              : "border-[var(--accent-gold)] bg-transparent text-[var(--text-primary)]"
          } ${saving ? "cursor-wait" : "disabled:cursor-not-allowed disabled:opacity-50"}`}
        >
          <Star size={18} weight={isConfidence ? "fill" : "bold"} />
          {isConfidence ? "CONFIDENCE BET" : "MARK AS BET"}
        </button>
      )}

      {!pick && !locked && hasLine && (
        <p className="mt-3 text-xs font-medium text-[var(--accent-red)]">No pick yet - counts as wrong at kickoff</p>
      )}
    </article>
  );
}
