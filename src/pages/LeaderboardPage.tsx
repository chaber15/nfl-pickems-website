import { useEffect, useState } from "react";
import { Crown } from "@phosphor-icons/react";
import type { GameData, LeaderboardEntry } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { apiLeaderboard } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { fetchScoreboard } from "@shared/espnClient";
import { getStoredPicks } from "../lib/localStorage";
import { computeLeaderboardFromLocal } from "@shared/statsCompute";

export function LeaderboardPage() {
  const { username, useBackend } = useAuth();
  const { seasonType, week, weekKey, ready } = useWeek();
  const [mode, setMode] = useState<"winPct" | "pl">("winPct");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true);
      try {
        if (useBackend) {
          try {
            const res = await apiLeaderboard();
            setEntries(res.entries);
            setGames([]);
            return;
          } catch {
            /* fall through */
          }
        }
        const board = await fetchScoreboard(seasonType, week);
        setGames(board.games);
        const picks = getStoredPicks(weekKey);
        if (username) {
          setEntries([computeLeaderboardFromLocal(username, board.games, picks)]);
        } else {
          setEntries([]);
        }
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [username, useBackend, seasonType, week, weekKey, ready]);

  const sorted = [...entries].sort((a, b) =>
    mode === "winPct"
      ? b.winPct - a.winPct || b.confidencePl - a.confidencePl
      : b.confidencePl - a.confidencePl || b.winPct - a.winPct,
  );

  return (
    <AppShell games={games}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-pixel text-sm leading-relaxed">Leaderboard</h2>
            <div className="flex rounded-2xl border-2 border-[var(--border-card)] p-1">
              <button
                type="button"
                onClick={() => setMode("winPct")}
                className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${
                  mode === "winPct" ? "bg-[var(--accent-green)] text-white" : "text-[var(--text-primary)]"
                }`}
              >
                Win %
              </button>
              <button
                type="button"
                onClick={() => setMode("pl")}
                className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${
                  mode === "pl" ? "bg-[var(--accent-green)] text-white" : "text-[var(--text-primary)]"
                }`}
              >
                Confidence P/L
              </button>
            </div>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {mode === "winPct"
              ? "Win % counts every final game. Missing a pick counts as wrong."
              : "Confidence P/L only counts weeks with exactly 5 ★ bets (playoffs: all games auto-count)."}
          </p>
        </div>

        {loading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-[var(--border-card)]" />
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
            No leaderboard data yet. Make picks and wait for kickoff.
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="px-4 py-3 font-semibold">Rank</th>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">
                      {mode === "winPct" ? "Win %" : "Units P/L"}
                    </th>
                    <th className="px-4 py-3 font-semibold">Record</th>
                    <th className="px-4 py-3 font-semibold">Weeks</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((entry, i) => (
                    <tr
                      key={entry.userId}
                      className={`border-t border-[var(--border-card)]/60 ${
                        i === 0 ? "bg-[var(--accent-gold)]/10" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono">
                        {i + 1}
                        {i === 0 && (
                          <Crown size={16} weight="fill" className="ml-1 inline text-[var(--accent-gold)]" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold">{entry.username}</td>
                      <td className="px-4 py-3 font-mono">
                        {mode === "winPct"
                          ? `${entry.winPct.toFixed(1)}%`
                          : entry.confidencePl.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {entry.correct.toFixed(entry.correct % 1 === 0 ? 0 : 1)}/{entry.total}
                      </td>
                      <td className="px-4 py-3 font-mono">{entry.weeksComplete}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {sorted.map((entry, i) => (
                <article
                  key={entry.userId}
                  className={`rounded-2xl border-2 p-4 ${
                    i === 0
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                      : "border-[var(--border-card)] bg-[var(--bg-card)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-lg font-bold">#{i + 1}</span>
                    {i === 0 && <Crown size={20} weight="fill" className="text-[var(--accent-gold)]" />}
                  </div>
                  <h3 className="mt-2 text-lg font-bold">{entry.username}</h3>
                  <p className="mt-1 font-mono text-2xl font-bold text-[var(--accent-green)]">
                    {mode === "winPct" ? `${entry.winPct.toFixed(1)}%` : entry.confidencePl.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {entry.correct.toFixed(entry.correct % 1 === 0 ? 0 : 1)}/{entry.total} correct
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
