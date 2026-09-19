import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Star } from "../components/icons";
import type { HistoryRow } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { apiHistory } from "../lib/api";
import { teamColor } from "../lib/teamLogos";

function outcomeLabel(row: HistoryRow): string {
  if (row.outcome === "no_pick") return "No pick";
  if (row.outcome === "win") return "Win";
  if (row.outcome === "loss") return "Loss";
  if (row.outcome === "push") return "Push";
  if (row.pickDisplay) return "Pending";
  return "—";
}

function outcomeClass(outcome: HistoryRow["outcome"]): string {
  if (outcome === "win") return "text-[var(--accent-green)]";
  if (outcome === "loss" || outcome === "no_pick") return "text-[var(--accent-red)]";
  if (outcome === "push") return "text-[var(--accent-gold)]";
  return "text-[var(--text-muted)]";
}

function unitsClass(units: number): string {
  if (units > 0) return "text-[var(--accent-green)]";
  if (units < 0) return "text-[var(--accent-red)]";
  return "";
}

function rowBorderClass(row: HistoryRow): string {
  if (row.outcome === "win") return "border-[var(--accent-green)]";
  if (row.outcome === "loss" || row.outcome === "no_pick") return "border-[var(--accent-red)]";
  if (row.outcome === "push") return "border-[var(--accent-gold)]";
  return "border-[var(--border-card)]";
}

function pickAccentStyle(row: HistoryRow): CSSProperties | undefined {
  if (!row.pickTeamAbbrev) return undefined;
  const color = teamColor(row.pickTeamAbbrev);
  return color ? { color } : undefined;
}

function resultText(row: HistoryRow): string {
  if (row.outcome === "pending" || row.outcome === "no_pick") return outcomeLabel(row);
  return row.resultDisplay ?? outcomeLabel(row);
}

export function HistoryPage() {
  const { username: routeUser } = useParams<{ username?: string }>();
  const { username } = useAuth();
  const { seasonType, week, ready } = useWeek();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewLabel, setViewLabel] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const targetUsername = routeUser ?? username;
  const viewingOther =
    routeUser != null && username != null && routeUser.toLowerCase() !== username.toLowerCase();

  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === "visible") setRefreshTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("focus", bump);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiHistory(seasonType, week, routeUser);
        if (cancelled) return;
        setRows(res.history);
        setViewLabel(res.displayName ?? res.username ?? routeUser ?? null);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seasonType, week, ready, routeUser, refreshTick]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">
              {viewingOther ? `${viewLabel ?? targetUsername}'s Picks` : "Previous Picks"}
            </h2>
            {viewingOther && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                <Link to="/history" className="font-semibold text-[var(--accent-blue)] underline">
                  Back to your history
                </Link>
              </p>
            )}
          </div>
        </div>

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
                          <span className="font-semibold" style={pickAccentStyle(row)}>
                            {row.pickDisplay ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.isConfidenceBet ? (
                          <Star size={16} weight="fill" className="text-[var(--accent-gold)]" />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${outcomeClass(row.outcome)}`}>
                        {resultText(row)}
                      </td>
                      <td className={`px-4 py-3 font-mono ${unitsClass(row.unitsDelta)}`}>
                        {row.outcome === "pending" || row.outcome === "no_pick"
                          ? "—"
                          : row.unitsDelta.toFixed(2)}
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
                  className={`rounded-2xl border-2 bg-[var(--bg-card)] p-4 ${rowBorderClass(row)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">Week {row.weekNumber}</p>
                    <span className={`text-xs font-bold uppercase tracking-wide ${outcomeClass(row.outcome)}`}>
                      {outcomeLabel(row)}
                    </span>
                  </div>
                  <h3 className="mt-1 font-bold">{row.matchup}</h3>
                  <p
                    className={`mt-2 text-base font-bold ${row.pickTeamAbbrev ? "" : outcomeClass(row.outcome)}`}
                    style={pickAccentStyle(row)}
                  >
                    {row.outcome === "no_pick" ? "No pick" : (row.pickDisplay ?? "No pick yet")}
                  </p>
                  {row.isConfidenceBet && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent-gold)]/20 px-3 py-1 text-xs font-bold text-[var(--accent-gold)]">
                      <Star size={12} weight="fill" /> Confidence bet
                    </span>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                    <span className={`font-semibold ${outcomeClass(row.outcome)}`}>
                      {resultText(row)}
                    </span>
                    <span className={`font-mono font-bold ${unitsClass(row.unitsDelta)}`}>
                      {row.outcome === "pending" || row.outcome === "no_pick"
                        ? "—"
                        : row.unitsDelta.toFixed(2)}
                    </span>
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
