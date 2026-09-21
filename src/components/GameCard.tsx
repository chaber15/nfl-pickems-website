import { useEffect, useState } from "react";
import { Check, X, Star } from "./icons";
import type { AtsResult, FavoriteSide, GameData, PickSide, UserPick } from "@shared/types";
import { formatKickoff, formatPick, formatSpread, formatJuice, juiceForSide } from "@shared/pickDisplay";
import { computeAtsResult, isGameLocked } from "@shared/scoring";
import {
  formatLiveClockLabel,
  formatSecondsAsClock,
  parseClockToSeconds,
  shouldTickLiveClock,
} from "@shared/liveClock";
import type { CrowdName, GameCrowdLean } from "../lib/crowdLean";
import { teamLogoSrc, teamLocationName, teamColor } from "../lib/teamLogos";

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
      loading="lazy"
      decoding="async"
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

function venueForPickSide(favoriteSide: FavoriteSide | null, pick: PickSide): Venue | null {
  if (!favoriteSide) return null;
  if (pick === "favorite") return favoriteSide;
  return favoriteSide === "home" ? "away" : "home";
}

function provisionalAts(game: GameData): AtsResult {
  if (game.status === "final" && game.atsResult) return game.atsResult;
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

function gradeLabelForPick(
  pick: PickSide | null,
  ats: AtsResult,
): "Push" | "Correct" | "Wrong" | null {
  if (!pick || !ats) return null;
  if (ats === "push") return "Push";
  return pick === ats ? "Correct" : "Wrong";
}

function resultToneFor(
  pick: PickSide | null,
  liveAts: AtsResult,
  gradeLabel: "Push" | "Correct" | "Wrong" | null,
): "win" | "loss" | "push" | null {
  if (pick && liveAts) {
    if (liveAts === "push") return "push";
    return pick === liveAts ? "win" : "loss";
  }
  if (gradeLabel === "Correct") return "win";
  if (gradeLabel === "Wrong") return "loss";
  if (gradeLabel === "Push") return "push";
  return null;
}

interface GameCardProps {
  game: GameData;
  userPick?: UserPick;
  onPick: (side: PickSide) => void;
  onToggleConfidence: () => void;
  confidenceDisabled?: boolean;
  crowd?: GameCrowdLean;
  /** Desktop: open names to fill row height when paired with a taller open-picks card. */
  expandCrowdNames?: boolean;
}

function NameList({
  names,
  tone,
}: {
  names: CrowdName[];
  tone?: "win" | "loss" | "push" | null;
}) {
  if (names.length === 0) {
    return <li className="italic text-[var(--text-muted)]">Nobody yet</li>;
  }
  const toneClass =
    tone === "win"
      ? "text-[var(--accent-green)]"
      : tone === "loss"
        ? "text-[var(--accent-red)]"
        : tone === "push"
          ? "text-[var(--accent-gold)]"
          : "text-[var(--text-muted)]";
  return (
    <>
      {names.map((r) => (
        <li key={r.username} className={`flex items-center justify-center gap-0.5 font-semibold ${toneClass}`}>
          {r.isYou ? "You" : r.username}
          {r.star && <Star size={11} weight="fill" className="text-[var(--accent-gold)]" />}
        </li>
      ))}
    </>
  );
}

function useFineHover(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return fine;
}

function useEstimatedClock(game: GameData): string | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    shouldTickLiveClock(game) ? parseClockToSeconds(game.displayClock) : null,
  );

  useEffect(() => {
    if (!shouldTickLiveClock(game)) {
      setSecondsLeft(null);
      return;
    }
    const initial = parseClockToSeconds(game.displayClock);
    setSecondsLeft(initial);
    if (initial == null) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSecondsLeft(Math.max(0, initial - elapsed));
    }, 1000);
    return () => window.clearInterval(id);
  }, [game.id, game.displayClock, game.period, game.statusDetail, game.status]);

  if (game.status !== "in_progress") return null;
  if (secondsLeft != null && shouldTickLiveClock(game)) {
    return formatLiveClockLabel({
      ...game,
      displayClock: formatSecondsAsClock(secondsLeft),
    });
  }
  return formatLiveClockLabel(game);
}

function crowdSideTone(
  game: GameData,
  venue: "away" | "home",
): "win" | "loss" | "push" | null {
  if (game.status !== "final" || game.awayScore == null || game.homeScore == null) return null;
  if (game.awayScore === game.homeScore) return "push";
  const awayWon = game.awayScore > game.homeScore;
  if (venue === "away") return awayWon ? "win" : "loss";
  return awayWon ? "loss" : "win";
}

function CrowdLean({
  crowd,
  game,
  expandByDefault = false,
}: {
  crowd: GameCrowdLean;
  game: GameData;
  expandByDefault?: boolean;
}) {
  const [pinned, setPinned] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const fineHover = useFineHover();

  const hasAnyone = crowd.awayCount > 0 || crowd.homeCount > 0 || crowd.openCount > 0;
  if (!hasAnyone) return null;

  const autoExpand = expandByDefault && fineHover;
  const picked = crowd.awayCount + crowd.homeCount;
  const awayPct = picked ? (crowd.awayCount / picked) * 100 : 0;
  const homePct = picked ? (crowd.homeCount / picked) * 100 : 0;
  const open = autoExpand
    ? !collapsed
    : pinned || (fineHover && hovered);
  const awayColor = teamColor(game.awayAbbrev);
  const homeColor = teamColor(game.homeAbbrev);
  const awayTone = crowdSideTone(game, "away");
  const homeTone = crowdSideTone(game, "home");

  return (
    <div
      className="mt-3 space-y-2"
      onMouseEnter={() => {
        if (fineHover) setHovered(true);
      }}
      onMouseLeave={() => {
        if (fineHover) setHovered(false);
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (autoExpand) setCollapsed((v) => !v);
          else setPinned((v) => !v);
        }}
        aria-expanded={open}
        aria-label={`Crowd lean: ${crowd.awayCount} away, ${crowd.homeCount} home — show names`}
        className="flex w-full shrink-0 items-center gap-2 rounded-lg py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
      >
        <span className="w-5 shrink-0 text-center font-mono text-xs font-bold tabular-nums text-[var(--text-muted)]">
          {crowd.awayCount}
        </span>
        <span
          className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--border-card)]"
          aria-hidden
        >
          {picked > 0 && (
            <span className="absolute inset-0 flex">
              <span
                className="h-full min-w-0"
                style={{ width: `${awayPct}%`, backgroundColor: awayColor }}
              />
              {crowd.awayCount > 0 && crowd.homeCount > 0 && (
                <span className="h-full w-0.5 shrink-0 bg-white" aria-hidden />
              )}
              <span
                className="h-full min-w-0"
                style={{ width: `${homePct}%`, backgroundColor: homeColor }}
              />
            </span>
          )}
        </span>
        <span className="w-5 shrink-0 text-center font-mono text-xs font-bold tabular-nums text-[var(--text-muted)]">
          {crowd.homeCount}
        </span>
      </button>

      {open && (
        <div className="grid max-h-40 grid-cols-2 gap-3 overflow-y-auto rounded-xl bg-[var(--bg-card-elevated)] px-3 py-2 sm:gap-4 sm:px-3">
          <ul className="space-y-0.5 text-center text-xs">
            <NameList names={crowd.away} tone={awayTone} />
          </ul>
          <ul className="space-y-0.5 text-center text-xs">
            <NameList names={crowd.home} tone={homeTone} />
          </ul>
        </div>
      )}

      {crowd.openCount > 0 && (
        <p className="text-center text-[10px] font-medium text-[var(--text-muted)]">
          {crowd.openCount} still open
        </p>
      )}
    </div>
  );
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
  const isFavorite = game.favoriteSide === venue;
  const pickSide = pickSideForVenue(game.favoriteSide, venue);
  const abbrev = venue === "away" ? game.awayAbbrev : game.homeAbbrev;
  const location = teamLocationName(abbrev, venue === "away" ? game.awayTeam : game.homeTeam);
  const record = venue === "away" ? game.awayRecord : game.homeRecord;
  const venueLabel = venue === "away" ? "AWAY" : "HOME";
  const spread =
    game.spread != null && pickSide && game.favoriteSide
      ? formatSpread(game.spread, pickSide, game.favoriteSide)
      : null;
  const juice = pickSide ? formatJuice(juiceForSide(game, pickSide)) : null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-3 py-3 text-center transition-colors transition-transform ${
        selected
          ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-[var(--accent-on-green)]"
          : isFavorite
            ? "border-[var(--accent-blue)] bg-[var(--bg-card)] text-[var(--text-primary)]"
            : "border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer active:scale-[0.98]"}`}
    >
      <span className={`text-[10px] font-bold tracking-wide ${selected ? "opacity-80" : "text-[var(--text-muted)]"}`}>
        {venueLabel}
        {isFavorite && (
          <span className={selected ? "" : " text-[var(--accent-blue)]"}> · FAV</span>
        )}
      </span>
      <span className="w-full truncate text-sm font-semibold leading-tight">
        {location}
        {record ? (
          <span className={`ml-1 font-mono text-xs font-medium ${selected ? "opacity-80" : "text-[var(--text-muted)]"}`}>
            ({record})
          </span>
        ) : null}
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

export function GameCard({
  game,
  userPick,
  onPick,
  onToggleConfidence,
  confidenceDisabled,
  crowd,
  expandCrowdNames = false,
}: GameCardProps) {
  const locked = isGameLocked(game.kickoffAt);
  const hasLine = game.spread != null && game.favoriteSide;
  const pick = userPick?.pick ?? null;
  const isConfidence = userPick?.isConfidenceBet ?? false;
  const isPlayoff = ["wildcard", "divisional", "conf", "superbowl"].includes(game.phase);
  const graded = game.status === "final" && game.atsResult;
  const notStarted = game.status === "scheduled";
  const showScores = !notStarted && game.awayScore != null && game.homeScore != null;
  const awayPick = pickSideForVenue(game.favoriteSide, "away");
  const homePick = pickSideForVenue(game.favoriteSide, "home");
  const liveLabel = useEstimatedClock(game);
  const liveAts = provisionalAts(game);
  const gradeLabel = gradeLabelForPick(pick, graded ? game.atsResult : null);
  const resultTone = resultToneFor(pick, liveAts, gradeLabel);

  const pickVenue = pick ? venueForPickSide(game.favoriteSide, pick) : null;
  const fillMatchup = locked || showScores;
  const awayWon = showScores && (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeWon = showScores && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const scoreTied = showScores && game.awayScore === game.homeScore;

  const teamPanelClass = (venue: Venue) => {
    if (showScores) {
      const won = venue === "away" ? awayWon : homeWon;
      if (won) return "bg-[var(--accent-green)]/15 ring-2 ring-[var(--accent-green)]";
      if (scoreTied) return "bg-[var(--accent-gold)]/15 ring-2 ring-[var(--accent-gold)]";
      return "bg-[var(--accent-red)]/15 ring-2 ring-[var(--accent-red)]";
    }
    if (pickVenue === venue) {
      return "bg-[var(--bg-card-elevated)] ring-2 ring-[var(--border-card)]";
    }
    return fillMatchup ? "bg-[var(--bg-card-elevated)]/60" : "";
  };

  const onPickVenue = (venue: Venue) => {
    const side = pickSideForVenue(game.favoriteSide, venue);
    if (side) onPick(side);
  };

  const cardBorderClass =
    resultTone === "win"
      ? "border-[var(--accent-green)]"
      : resultTone === "loss"
        ? "border-[var(--accent-red)]"
        : resultTone === "push"
          ? "border-[var(--accent-gold)]"
          : "border-[var(--border-card)]";

  const renderTeam = (venue: Venue) => {
    const abbrev = venue === "away" ? game.awayAbbrev : game.homeAbbrev;
    const name = venue === "away" ? game.awayTeam : game.homeTeam;
    const record = venue === "away" ? game.awayRecord : game.homeRecord;
    const score = venue === "away" ? game.awayScore : game.homeScore;
    const won = venue === "away" ? awayWon : homeWon;
    const scoreClass = showScores
      ? won
        ? "text-[var(--accent-green)]"
        : scoreTied
          ? "text-[var(--accent-gold)]"
          : "text-[var(--accent-red)]"
      : "";

    return (
      <div
        className={`flex min-w-0 flex-1 rounded-xl ${teamPanelClass(venue)} ${
          fillMatchup
            ? "flex-col items-center gap-1 p-2 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3"
            : "flex-col items-center gap-1 p-1 text-center"
        }`}
      >
        <div
          className={`flex min-w-0 flex-col items-center gap-1 ${
            fillMatchup ? "sm:flex-1 sm:flex-row sm:gap-3" : ""
          }`}
        >
          <TeamLogo abbrev={abbrev} name={name} size={showScores ? 44 : 56} />
          <div className={`min-w-0 text-center ${fillMatchup ? "w-full sm:flex-1" : "w-full"}`}>
            <p
              className={`font-bold leading-tight ${
                fillMatchup
                  ? "w-full truncate text-sm sm:whitespace-normal sm:text-base"
                  : "w-full truncate text-sm"
              }`}
            >
              {name}
            </p>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {(game.status === "in_progress" || game.status === "final") && record
                ? record
                : `${abbrev} · ${venue === "away" ? "away" : "home"}`}
            </p>
          </div>
        </div>
        {showScores && (
          <span className={`font-mono text-2xl font-bold tabular-nums sm:text-3xl ${scoreClass}`}>
            {score}
          </span>
        )}
      </div>
    );
  };

  return (
    <article
      className={`flex h-full flex-col rounded-2xl border-2 bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)] ${cardBorderClass}`}
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
              {liveLabel ?? "LIVE"}
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
          {!gradeLabel && game.status === "in_progress" && resultTone && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                resultTone === "win"
                  ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
                  : resultTone === "push"
                    ? "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
                    : "bg-[var(--accent-red)]/15 text-[var(--accent-red)]"
              }`}
            >
              {resultTone === "win" ? "Covering" : resultTone === "push" ? "Pushing" : "Losing"}
            </span>
          )}
        </div>
      </div>

      <div className={`mb-4 flex gap-2 sm:gap-3 ${fillMatchup ? "items-stretch" : "items-center justify-center gap-3 sm:gap-4"}`}>
        {renderTeam("away")}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-0.5">
          <span className="font-display text-2xl text-[var(--text-muted)]">@</span>
          {notStarted && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Pre-game</span>
          )}
        </div>
        {renderTeam("home")}
      </div>

      {!hasLine && !locked && (
        <p className="mb-4 rounded-2xl border-2 border-dashed border-[var(--border-card)] px-4 py-3 text-sm text-[var(--text-muted)]">
          Line not posted yet
        </p>
      )}

      {locked && pick && (
        <p className="mb-4 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-4 py-3 text-sm font-bold sm:font-semibold">
          Your pick: {formatPick(game, pick)}
          {isConfidence && (
            <Star size={14} weight="fill" className="ml-1 inline text-[var(--accent-gold)]" />
          )}
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

      {crowd && (
        <CrowdLean
          crowd={crowd}
          game={game}
          expandByDefault={expandCrowdNames}
        />
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
    </article>
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
