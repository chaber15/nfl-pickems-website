import { useState } from "react";
import { Star } from "../icons";
import type { GameData } from "@shared/types";
import type { CrowdName, GameCrowdLean } from "../../lib/crowdLean";
import { provisionalAts, venueAtsTone, type ResultTone } from "../../lib/gameStatus";
import { teamColor } from "../../lib/teamLogos";
import { toneText } from "../../lib/tone";
import { useMediaQuery } from "../../lib/useMediaQuery";

function NameList({ names, tone }: { names: CrowdName[]; tone: ResultTone }) {
  if (names.length === 0) {
    return <li className="italic text-[var(--text-muted)]">Nobody yet</li>;
  }
  const toneClass = toneText(tone);
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

/** Away/Home pick split bar; tap (or hover on desktop) to see names. Names are colored by who covered. */
export function CrowdLean({
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
  const fineHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  const hasAnyone = crowd.awayCount > 0 || crowd.homeCount > 0 || crowd.openCount > 0;
  if (!hasAnyone) return null;

  const autoExpand = expandByDefault && fineHover;
  const picked = crowd.awayCount + crowd.homeCount;
  const awayPct = picked ? (crowd.awayCount / picked) * 100 : 0;
  const homePct = picked ? (crowd.homeCount / picked) * 100 : 0;
  const open = autoExpand ? !collapsed : pinned || (fineHover && hovered);
  const ats = provisionalAts(game);
  const awayTone = venueAtsTone(game, "away", ats);
  const homeTone = venueAtsTone(game, "home", ats);

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
        aria-label={`Crowd lean: ${crowd.awayCount} picked ${game.awayAbbrev}, ${crowd.homeCount} picked ${game.homeAbbrev} — ${open ? "hide" : "show"} names`}
        className="flex min-h-11 w-full shrink-0 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
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
                style={{ width: `${awayPct}%`, backgroundColor: teamColor(game.awayAbbrev) }}
              />
              {crowd.awayCount > 0 && crowd.homeCount > 0 && (
                <span className="h-full w-0.5 shrink-0 bg-white" aria-hidden />
              )}
              <span
                className="h-full min-w-0"
                style={{ width: `${homePct}%`, backgroundColor: teamColor(game.homeAbbrev) }}
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
