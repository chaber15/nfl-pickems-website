import { useEffect, useState } from "react";
import type { GameData, UserStats } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { apiStats } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { fetchScoreboard } from "@shared/espnClient";
import { getStoredPicks } from "../lib/localStorage";
import { computeUserStats } from "@shared/statsCompute";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold text-[var(--accent-green)]">{value}</p>
    </div>
  );
}

export function StatsPage() {
  const { username, useBackend } = useAuth();
  const { seasonType, week, weekKey, ready } = useWeek();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true);
      try {
        if (useBackend) {
          try {
            const res = await apiStats();
            setStats(res.stats);
            setGames([]);
            return;
          } catch {
            /* fall through */
          }
        }
        const board = await fetchScoreboard(seasonType, week);
        setGames(board.games);
        const picks = getStoredPicks(weekKey);
        setStats(computeUserStats(board.games, picks));
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [username, useBackend, seasonType, week, weekKey, ready]);

  return (
    <AppShell games={games}>
      <div className="mx-auto max-w-6xl space-y-6">
        <h2 className="font-display text-3xl sm:text-4xl">My Stats</h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--border-card)]" />
            ))}
          </div>
        ) : !stats ? (
          <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
            No stats yet. Make picks to see your numbers.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              <StatCard label="Win % (all picks)" value={`${stats.winPctAll.toFixed(1)}%`} />
              <StatCard label="Win % (confidence)" value={`${stats.winPctConfidence.toFixed(1)}%`} />
              <StatCard label="Confidence P/L" value={stats.confidencePl.toFixed(2)} />
              <StatCard label="Hypothetical P/L" value={stats.hypotheticalPl.toFixed(2)} />
              <StatCard label="Confidence ROI" value={`${stats.confidenceRoi.toFixed(1)}%`} />
              <StatCard label="Hypothetical ROI" value={`${stats.hypotheticalRoi.toFixed(1)}%`} />
              <StatCard label="Favorite pick rate" value={`${stats.favoritePickRate.toFixed(0)}%`} />
              <StatCard label="Underdog pick rate" value={`${stats.underdogPickRate.toFixed(0)}%`} />
              <StatCard label="Favorite hit rate" value={`${stats.favoriteHitRate.toFixed(0)}%`} />
              <StatCard label="Underdog hit rate" value={`${stats.underdogHitRate.toFixed(0)}%`} />
              <StatCard label="Favorite units" value={stats.favoriteUnits.toFixed(2)} />
              <StatCard label="Underdog units" value={stats.underdogUnits.toFixed(2)} />
              <StatCard label="Streak (all)" value={String(stats.currentStreakAll)} />
              <StatCard label="Streak (confidence)" value={String(stats.currentStreakConfidence)} />
              <StatCard
                label="Best week P/L"
                value={
                  stats.bestWeekConfidence
                    ? `W${stats.bestWeekConfidence.week}: ${stats.bestWeekConfidence.pl.toFixed(2)}`
                    : "-"
                }
              />
              <StatCard
                label="Worst week P/L"
                value={
                  stats.worstWeekConfidence
                    ? `W${stats.worstWeekConfidence.week}: ${stats.worstWeekConfidence.pl.toFixed(2)}`
                    : "-"
                }
              />
            </div>

            <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6">
              <h3 className="mb-4 font-bold">P/L Tracks</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-muted)]">Confidence P/L</p>
                  <p className="font-mono text-xl font-bold">{stats.confidencePl.toFixed(2)} units</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                From eligible weeks only: exactly 5 ★ bets (regular/preseason), or all playoff games.
              </p>
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-muted)]">Hypothetical P/L</p>
                  <p className="font-mono text-xl font-bold">{stats.hypotheticalPl.toFixed(2)} units</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    As if you bet every game. Unpicked games cost 1 unit each.
                  </p>
                </div>
              </div>
            </div>

            {stats.weeklyRows.length > 0 && (
              <div className="overflow-hidden rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)]">
                <h3 className="border-b-2 border-[var(--border-card)] px-4 py-3 font-bold">Weekly breakdown</h3>
                <div className="hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[var(--text-muted)]">
                        <th className="px-4 py-3 font-semibold">Week</th>
                        <th className="px-4 py-3 font-semibold">Picks</th>
                        <th className="px-4 py-3 font-semibold">Bets</th>
                        <th className="px-4 py-3 font-semibold">Win %</th>
                        <th className="px-4 py-3 font-semibold">Conf P/L</th>
                        <th className="px-4 py-3 font-semibold">Hypo P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.weeklyRows.map((row) => (
                        <tr key={`${row.phase}-${row.weekNumber}`} className="border-t border-[var(--border-card)]/60">
                          <td className="px-4 py-3 font-mono">{row.weekNumber}</td>
                          <td className="px-4 py-3 font-mono">
                            {row.picksMade}/{row.totalGames}
                          </td>
                          <td className="px-4 py-3 font-mono">{row.confidenceBets}</td>
                          <td className="px-4 py-3 font-mono">{row.winPct.toFixed(1)}%</td>
                          <td className="px-4 py-3 font-mono">
                            {row.plEligible ? row.confidencePl.toFixed(2) : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono">{row.hypotheticalPl.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 p-4 md:hidden">
                  {stats.weeklyRows.map((row) => (
                    <article
                      key={`${row.phase}-${row.weekNumber}`}
                      className="rounded-xl bg-[var(--bg-page)] p-4"
                    >
                      <p className="font-bold">Week {row.weekNumber}</p>
                      <p className="mt-1 font-mono text-sm text-[var(--text-muted)]">
                        {row.picksMade}/{row.totalGames} picks · {row.confidenceBets} bets
                        {!row.plEligible && row.phase !== "wildcard" && row.phase !== "divisional" && row.phase !== "conf" && row.phase !== "superbowl"
                          ? " · P/L incomplete"
                          : ""}
                      </p>
                      <p className="mt-2 font-mono text-sm">
                        Win {row.winPct.toFixed(1)}% · Conf{" "}
                        {row.plEligible ? row.confidencePl.toFixed(2) : "n/a"} · Hypo{" "}
                        {row.hypotheticalPl.toFixed(2)}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
