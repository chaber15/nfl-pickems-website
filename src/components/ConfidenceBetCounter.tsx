import { Star } from "./icons";
import { CONFIDENCE_BETS_PER_WEEK, type WeekPhase } from "@shared/types";
import { isPlayoffPhase } from "@shared/scoring";
import { HelpTip, PL_HELP } from "./HelpTip";

interface ConfidenceBetCounterProps {
  count: number;
  max?: number;
  phase: WeekPhase;
}

export function ConfidenceBetCounter({ count, max = CONFIDENCE_BETS_PER_WEEK, phase }: ConfidenceBetCounterProps) {
  if (isPlayoffPhase(phase)) {
    return (
      <div className="rounded-2xl border-2 border-[var(--accent-gold)] bg-[var(--bg-card)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
        Playoffs: every game you pick counts toward P/L{" "}
        <HelpTip label="What is P/L?">{PL_HELP}</HelpTip>
      </div>
    );
  }

  const complete = count === max;
  return (
    <div
      className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold ${
        complete
          ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
          : "border-[var(--accent-gold)] bg-[var(--bg-card)] text-[var(--text-primary)]"
      }`}
    >
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <Star size={18} weight="fill" className="text-[var(--accent-gold)]" />
        <span>
          <span className="font-mono">
            {count}/{max}
          </span>{" "}
          confidence bets selected
          {!complete && (
            <span className="text-[var(--text-muted)]">
              {" "}
              - pick exactly {max} for this week to count on the P/L board
              {count > 0 && count < max ? ` (${max - count} more)` : ""}
              {count > max ? ` (${count - max} too many)` : ""}
            </span>
          )}
          {complete && " - this week counts on the P/L board"}
        </span>
        <HelpTip label="What is P/L?">{PL_HELP}</HelpTip>
      </span>
    </div>
  );
}
