import type { GameData } from "@shared/types";
import type { ResultTone, Venue } from "../../lib/gameStatus";
import { tonePanel, toneText } from "../../lib/tone";
import { TeamLogo } from "./TeamLogo";

/**
 * One side of the matchup. Once scores show, the panel color follows the spread
 * (covered = green, didn't cover = red, push = gold) — not who won outright.
 */
export function TeamPanel({
  game,
  venue,
  showScores,
  fillMatchup,
  atsTone,
  picked,
}: {
  game: GameData;
  venue: Venue;
  showScores: boolean;
  fillMatchup: boolean;
  /** ATS tone for this team (live or final); null when there is no line to grade against. */
  atsTone: ResultTone;
  picked: boolean;
}) {
  const abbrev = venue === "away" ? game.awayAbbrev : game.homeAbbrev;
  const name = venue === "away" ? game.awayTeam : game.homeTeam;
  const record = venue === "away" ? game.awayRecord : game.homeRecord;
  const score = venue === "away" ? game.awayScore : game.homeScore;

  const panelClass = showScores
    ? atsTone
      ? tonePanel(atsTone)
      : "bg-[var(--bg-card-elevated)]"
    : picked
      ? "bg-[var(--bg-card-elevated)] ring-2 ring-[var(--border-card)]"
      : fillMatchup
        ? "bg-[var(--bg-card-elevated)]/60"
        : "";

  return (
    <div
      className={`flex min-w-0 flex-1 rounded-xl ${panelClass} ${
        fillMatchup
          ? "flex-col items-center gap-1 p-2 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3"
          : "flex-col items-center gap-1 p-1 text-center"
      }`}
    >
      <div className={`flex min-w-0 flex-col items-center gap-1 ${fillMatchup ? "sm:flex-1 sm:flex-row sm:gap-3" : ""}`}>
        <TeamLogo abbrev={abbrev} name={name} size={showScores ? 44 : 56} />
        <div className={`min-w-0 text-center ${fillMatchup ? "w-full sm:flex-1" : "w-full"}`}>
          <p
            className={`font-bold leading-tight ${
              fillMatchup ? "w-full truncate text-sm sm:whitespace-normal sm:text-base" : "w-full truncate text-sm"
            }`}
          >
            {name}
          </p>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {(game.status === "in_progress" || game.status === "final") && record
              ? record
              : `${abbrev} · ${venue}`}
          </p>
        </div>
      </div>
      {showScores && (
        <span
          className={`font-mono text-2xl font-bold tabular-nums sm:text-3xl ${toneText(atsTone, "")}`}
        >
          {score}
        </span>
      )}
    </div>
  );
}
