import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Crown } from "./icons";
import type { LeaderboardEntry } from "@shared/types";
import { shortWeekLabel } from "@shared/weekUtils";
import { apiLeaderboard, errorMessage } from "../lib/api";
import { fetchCached, leaderboardCacheKey } from "../lib/cache";
import { useWeek, useWeekSearch } from "../lib/weekContext";
import { ErrorState } from "./ErrorState";
import { PL_HELP } from "./HelpTip";

/** Reuse a recent weekly leaderboard (e.g. just loaded by the Leaderboard page). */
const MAX_AGE_MS = 60_000;

const TOP_N = 5;

type SortMode = "winPct" | "pl";

/** Compact current-week standings for the desktop sidebar. */
export function MiniWeeklyLeaderboard() {
  const { seasonType, week, ready } = useWeek();
  const weekSearch = useWeekSearch();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>("winPct");
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!ready) return;
    const id = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCached(
        leaderboardCacheKey(seasonType, week),
        () => apiLeaderboard(seasonType, week),
        MAX_AGE_MS,
      );
      if (id === reqRef.current) setEntries(res.entries);
    } catch (err) {
      if (id !== reqRef.current) return;
      setEntries([]);
      setError(errorMessage(err, "Couldn't load standings"));
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [ready, seasonType, week]);

  useEffect(() => {
    void load();
  }, [load]);

  const top = useMemo(
    () =>
      [...entries]
        .sort((a, b) =>
          sortBy === "winPct"
            ? b.winPct - a.winPct || b.confidencePl - a.confidencePl
            : b.confidencePl - a.confidencePl || b.winPct - a.winPct,
        )
        .slice(0, TOP_N),
    [entries, sortBy],
  );

  const sortBtn = (mode: SortMode, label: string) => (
    <button
      type="button"
      onClick={() => setSortBy(mode)}
      aria-pressed={sortBy === mode}
      className={`w-9 shrink-0 text-right font-mono text-[10px] font-bold uppercase tracking-wide transition-colors ${
        sortBy === mode
          ? "text-[var(--accent-green)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-4 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg leading-none text-[var(--text-primary)]">
          This week
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {shortWeekLabel(seasonType, week)}
        </span>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-[var(--border-card)]" />
      ) : error ? (
        <ErrorState compact message={error} onRetry={load} />
      ) : top.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No results yet.</p>
      ) : (
        <>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            <span className="w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Player
            </span>
            {sortBtn("winPct", "Win %")}
            <span title={PL_HELP}>{sortBtn("pl", "P/L")}</span>
          </div>
          <ol className="space-y-1.5">
            {top.map((e, i) => (
              <li
                key={e.userId}
                className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]"
              >
                <span className="w-4 shrink-0 font-mono text-[var(--text-muted)]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {e.displayName || e.username}
                  {i === 0 && (
                    <Crown size={12} weight="fill" className="ml-1 inline text-[var(--accent-gold)]" />
                  )}
                </span>
                <span
                  className={`w-9 shrink-0 text-right font-mono ${
                    sortBy === "winPct" ? "text-[var(--accent-green)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {e.winPct.toFixed(0)}%
                </span>
                <span
                  className={`w-9 shrink-0 text-right font-mono ${
                    sortBy === "pl" ? "text-[var(--accent-green)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {e.confidencePl.toFixed(2)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <Link
        to={{ pathname: "/leaderboard", search: weekSearch }}
        className="mt-3 block text-center text-[10px] font-bold uppercase tracking-wide text-[var(--accent-blue)] hover:underline"
      >
        Full leaders
      </Link>
    </div>
  );
}
