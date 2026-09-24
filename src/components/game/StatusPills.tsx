import { Check, X } from "../icons";
import type { GameData } from "@shared/types";
import { isPostponed, type GradeLabel, type ResultTone } from "../../lib/gameStatus";
import { tonePill } from "../../lib/tone";

const PILL = "rounded-full px-3 py-1 text-xs font-bold";

/** Game state + your result, shown top-right on a game card. One label per fact. */
export function StatusPills({
  game,
  liveLabel,
  gradeLabel,
  liveTone,
}: {
  game: GameData;
  liveLabel: string | null;
  gradeLabel: GradeLabel | null;
  liveTone: ResultTone;
}) {
  const postponed = isPostponed(game);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {postponed && (
        <span className={`${PILL} bg-[var(--accent-gold)]/15 uppercase text-[var(--accent-gold)]`}>
          {game.statusDetail}
        </span>
      )}
      {game.status === "scheduled" && !postponed && (
        <span
          className={`${PILL} border-2 border-dashed border-[var(--border-card)] bg-[var(--bg-card-elevated)] tracking-wide text-[var(--text-muted)]`}
        >
          NOT STARTED
        </span>
      )}
      {game.status === "in_progress" && (
        <span className={`${PILL} bg-[var(--accent-red)]/15 text-[var(--accent-red)]`}>{liveLabel ?? "LIVE"}</span>
      )}
      {game.status === "final" && !gradeLabel && (
        <span className={`${PILL} bg-[var(--bg-card-elevated)] text-[var(--text-muted)]`}>FINAL</span>
      )}
      {gradeLabel && (
        <span
          className={`inline-flex items-center gap-1 ${PILL} ${tonePill(
            gradeLabel === "Correct" ? "win" : gradeLabel === "Push" ? "push" : "loss",
          )}`}
        >
          {gradeLabel === "Wrong" ? <X size={14} weight="bold" /> : <Check size={14} weight="bold" />}
          {gradeLabel}
        </span>
      )}
      {!gradeLabel && game.status === "in_progress" && liveTone && (
        <span className={`${PILL} ${tonePill(liveTone)}`}>
          {liveTone === "win" ? "Covering" : liveTone === "push" ? "Pushing" : "Losing"}
        </span>
      )}
    </div>
  );
}
