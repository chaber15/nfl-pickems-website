import type { GameData } from "@shared/types";
import { tickerLine } from "@shared/pickDisplay";

interface TickerBarProps {
  games: GameData[];
}

export function TickerBar({ games }: TickerBarProps) {
  const items =
    games.length > 0
      ? games.map((g) => {
          const line = tickerLine(g);
          const tone =
            g.status === "final" && g.atsResult === "favorite"
              ? "text-[var(--ticker-green)]"
              : g.status === "final" && g.atsResult === "underdog"
                ? "text-[var(--ticker-red)]"
                : "text-[var(--ticker-amber)]";
          return { line, tone };
        })
      : [{ line: "NFL Pick'ems loading scores...", tone: "text-[var(--ticker-amber)]" }];
  const doubled = [...items, ...items];

  return (
    <div className="sticky top-0 z-40 overflow-hidden bg-[var(--ticker-bg)] py-2 text-sm">
      <div className="ticker-track flex w-max whitespace-nowrap">
        {doubled.map((item, i) => (
          <span
            key={`${item.line}-${i}`}
            className={`inline-flex items-center px-6 font-mono ${item.tone}`}
          >
            {item.line}
            <span className="mx-4 text-[#64748b]">|</span>
          </span>
        ))}
      </div>
    </div>
  );
}
