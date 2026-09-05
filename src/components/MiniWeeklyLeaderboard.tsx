import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown } from "@phosphor-icons/react";
import type { LeaderboardEntry } from "@shared/types";
import { shortWeekLabel, weekStorageKey } from "@shared/weekUtils";
import { apiLeaderboard, isDemoMode } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { getStoredPicks } from "../lib/localStorage";
import { loadWeekGames } from "../lib/loadWeekGames";
import { computeLeaderboardFromLocal } from "@shared/statsCompute";

const TOP_N = 5;

type SortMode = "winPct" | "pl";

/** Compact current-week standings for the desktop sidebar. */
export function MiniWeeklyLeaderboard() {
  const { username, useBackend } = useAuth();
  const { seasonType, week, ready } = useWeek();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortMode>("winPct");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (useBackend && !isDemoMode()) {
          try {
            const res = await apiLeaderboard(seasonType, week);
            if (!cancelled) setEntries(res.entries);
            return;
          } catch {
            /* fall through */
          }
        }
        const weekKey = weekStorageKey(seasonType, week);
        const board = await loadWeekGames(seasonType, week, weekKey);
        const picks = getStoredPicks(weekKey);
        if (!cancelled) {
          setEntries(
            username ? [computeLeaderboardFromLocal(username, board.games, picks)] : [],
          );
        }
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, useBackend, username, seasonType, week]);

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
            {sortBtn("pl", "P/L")}
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
        to="/leaderboard"
        className="mt-3 block text-center text-[10px] font-bold uppercase tracking-wide text-[var(--accent-blue)] hover:underline"
      >
        Full leaders
      </Link>
    </div>
  );
}
