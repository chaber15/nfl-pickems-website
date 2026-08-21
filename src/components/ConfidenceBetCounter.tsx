import { Star } from "@phosphor-icons/react";
import { CONFIDENCE_BETS_PER_WEEK } from "@shared/types";

interface ConfidenceBetCounterProps {
  count: number;
  max?: number;
  phase: string;
}

export function ConfidenceBetCounter({ count, max = CONFIDENCE_BETS_PER_WEEK, phase }: ConfidenceBetCounterProps) {
  const isPlayoff = ["wildcard", "divisional", "conf", "superbowl"].includes(phase);
  if (isPlayoff) {
    return (
      <div className="rounded-2xl border-2 border-[var(--accent-gold)] bg-[var(--bg-card)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
        Playoffs: all games count toward P/L
      </div>
    );
  }
  if (phase === "preseason") {
    return (
      <div className="rounded-2xl border-2 border-[var(--accent-gold)] bg-[var(--bg-card)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
        <span className="inline-flex items-center gap-2">
          <Star size={18} weight="fill" className="text-[var(--accent-gold)]" />
          <span className="font-mono">
            {count}/{max}
          </span>{" "}
          confidence bets (practice - regular season requires exactly {max})
        </span>
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
      <span className="inline-flex items-center gap-2">
        <Star size={18} weight="fill" className="text-[var(--accent-gold)]" />
        <span className="font-mono">
          {count}/{max}
        </span>{" "}
        confidence bets selected
        {!complete && (
          <span className="text-[var(--text-muted)]">
            {" "}
            - need exactly {max} for this week to count toward P/L rankings
            {count > 0 ? ` (${max - count} more)` : ""}
          </span>
        )}
        {complete && " - P/L week locked in"}
      </span>
    </div>
  );
}
