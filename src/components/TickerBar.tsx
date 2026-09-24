import { tickerLine } from "@shared/pickDisplay";
import { useGames } from "../lib/gamesContext";

/** Scrolling score strip for the selected week. Hidden when there is nothing to show. */
export function TickerBar() {
  const { games, loading, error } = useGames();

  if (games.length === 0 && (!loading || error)) return null;

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
    <div className="sticky top-0 z-40 overflow-hidden bg-[var(--ticker-bg)] py-2 text-sm" aria-hidden>
      <div className="ticker-track flex w-max items-center whitespace-nowrap">
        {doubled.map((item, i) => (
          <span key={`${item.line}-${i}`} className="inline-flex items-center">
            <span
              className={`inline-flex min-w-[11rem] items-center justify-center px-5 text-center font-mono ${item.tone}`}
            >
              {item.line}
            </span>
            <span className="inline-flex w-4 shrink-0 justify-center text-[#64748b]" aria-hidden>
              |
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
