import { useEffect, useState } from "react";
import { Star } from "@phosphor-icons/react";
import { buildHistoryRows } from "@shared/statsCompute";
import type { GameData, HistoryRow } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { getStoredPicks } from "../lib/localStorage";
import { loadWeekGames } from "../lib/loadWeekGames";
import { apiHistory } from "../lib/api";

function outcomeLabel(row: HistoryRow): string {
  if (row.outcome === "no_pick") return "No pick";
  if (row.outcome === "win") return "Win";
  if (row.outcome === "loss") return "Loss";
  if (row.outcome === "push") return "Push";
  return "Pending";
}

export function HistoryPage() {
  const { username, useBackend } = useAuth();
  const { seasonType, week, weekKey, ready } = useWeek();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true);
      try {
        if (useBackend) {
          try {
            const res = await apiHistory(seasonType, week);
            setRows(res.history);
            setGames([]);
            return;
          } catch {
            /* fall through to local */
          }
        }
        const board = await loadWeekGames(seasonType, week, weekKey);
        setGames(board.games);
        const picks = getStoredPicks(weekKey);
        setRows(buildHistoryRows(board.games, picks));
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [useBackend, username, seasonType, week, weekKey, ready]);

  return (
    <AppShell games={games}>
      <div className="mx-auto max-w-5xl space-y-6">
        <h2 className="font-display text-3xl sm:text-4xl">Previous Picks</h2>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--border-card)]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
            No games for this week yet.
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="px-4 py-3 font-semibold">Week</th>
                    <th className="px-4 py-3 font-semibold">Matchup</th>
                    <th className="px-4 py-3 font-semibold">Pick</th>
                    <th className="px-4 py-3 font-semibold">Bet</th>
                    <th className="px-4 py-3 font-semibold">Result</th>
                    <th className="px-4 py-3 font-semibold">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.gameId} className="border-t border-[var(--border-card)]/60">
                      <td className="px-4 py-3 font-mono">{row.weekNumber}</td>
                      <td className="px-4 py-3 font-semibold">{row.matchup}</td>
                      <td className="px-4 py-3">
                        {row.outcome === "no_pick" ? (
                          <span className="font-bold text-[var(--accent-red)]">No pick</span>
                        ) : (
                          row.pickDisplay ?? "Pending"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.isConfidenceBet ? (
                          <Star size={16} weight="fill" className="text-[var(--accent-gold)]" />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.resultDisplay ?? outcomeLabel(row)}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono ${
                          row.unitsDelta > 0
                            ? "text-[var(--accent-green)]"
                            : row.unitsDelta < 0
                              ? "text-[var(--accent-red)]"
                              : ""
                        }`}
                      >
                        {row.unitsDelta.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article
                  key={row.gameId}
                  className={`rounded-2xl border-2 bg-[var(--bg-card)] p-4 ${
                    row.isConfidenceBet ? "border-[var(--accent-gold)]" : "border-[var(--border-card)]"
                  }`}
                >
                  <p className="text-xs font-semibold text-[var(--text-muted)]">Week {row.weekNumber}</p>
                  <h3 className="mt-1 font-bold">{row.matchup}</h3>
                  <p className="mt-2 text-sm">
                    {row.outcome === "no_pick" ? (
                      <span className="font-bold text-[var(--accent-red)]">No pick</span>
                    ) : (
                      row.pickDisplay ?? "Pending"
                    )}
                  </p>
                  {row.isConfidenceBet && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent-gold)]/20 px-3 py-1 text-xs font-bold text-[var(--accent-gold)]">
                      <Star size={12} weight="fill" /> Confidence bet
                    </span>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span>{row.resultDisplay ?? outcomeLabel(row)}</span>
                    <span className="font-mono">{row.unitsDelta.toFixed(2)}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
