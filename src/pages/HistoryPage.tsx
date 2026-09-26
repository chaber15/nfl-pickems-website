import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Star } from "../components/icons";
import type { HistoryRow } from "@shared/types";
import { ErrorState } from "../components/ErrorState";
import { useAuth } from "../lib/authContext";
import { useWeek, useWeekSearch } from "../lib/weekContext";
import { apiHistory, errorMessage } from "../lib/api";
import { teamColor } from "../lib/teamLogos";
import { toneBorder, toneText } from "../lib/tone";
import type { ResultTone } from "../lib/gameStatus";
import { useTabReturn } from "../lib/visibility";

function outcomeTone(outcome: HistoryRow["outcome"]): ResultTone {
  if (outcome === "win") return "win";
  if (outcome === "loss" || outcome === "no_pick") return "loss";
  if (outcome === "push") return "push";
  return null;
}

function outcomeLabel(row: HistoryRow): string {
  if (row.outcome === "no_pick") return "No pick";
  if (row.outcome === "win") return "Win";
  if (row.outcome === "loss") return "Loss";
  if (row.outcome === "push") return "Push";
  if (row.pickDisplay) return "Pending";
  return "—";
}

function outcomeClass(outcome: HistoryRow["outcome"]): string {
  return toneText(outcomeTone(outcome));
}

function unitsClass(units: number): string {
  if (units > 0) return "text-[var(--accent-green)]";
  if (units < 0) return "text-[var(--accent-red)]";
  return "";
}

function rowBorderClass(row: HistoryRow): string {
  return toneBorder(outcomeTone(row.outcome));
}

/** Team color for the picked side; pair with the `team-ink` class (readable in both themes). */
function pickAccentStyle(row: HistoryRow): CSSProperties | undefined {
  if (!row.pickTeamAbbrev) return undefined;
  return { "--team": teamColor(row.pickTeamAbbrev) } as CSSProperties;
}

function resultText(row: HistoryRow): string {
  if (row.outcome === "pending" || row.outcome === "no_pick") return outcomeLabel(row);
  return row.resultDisplay ?? outcomeLabel(row);
}

export function HistoryPage() {
  const { username: routeUser } = useParams<{ username?: string }>();
  const { username } = useAuth();
  const { seasonType, week, ready } = useWeek();
  const weekSearch = useWeekSearch();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewLabel, setViewLabel] = useState<string | null>(null);
  const reqRef = useRef(0);

  const targetUsername = routeUser ?? username;
  const viewingOther =
    routeUser != null && username != null && routeUser.toLowerCase() !== username.toLowerCase();

  const load = useCallback(
    async (background = false) => {
      if (!ready) return;
      const id = ++reqRef.current;
      if (!background) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await apiHistory(seasonType, week, routeUser);
        if (id !== reqRef.current) return;
        setRows(res.history);
        setError(null);
        setViewLabel(res.displayName ?? res.username ?? routeUser ?? null);
      } catch (err) {
        if (id !== reqRef.current) return;
        // A failed background refresh keeps the rows already on screen.
        if (!background) setRows([]);
        setError(errorMessage(err, "Couldn't load picks"));
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    },
    [seasonType, week, ready, routeUser],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh results when the user comes back, but only while games may still change.
  useTabReturn(() => {
    if (rows.some((r) => r.outcome === "pending")) void load(true);
  }, ready);

  return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">
              {viewingOther ? `${viewLabel ?? targetUsername}'s Picks` : "Previous Picks"}
            </h2>
            {viewingOther && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                <Link to={{ pathname: "/history", search: weekSearch }} className="font-semibold text-[var(--accent-blue)] underline">
                  Back to your history
                </Link>
              </p>
            )}
          </div>
        </div>

        {error && rows.length > 0 && <ErrorState compact message={error} onRetry={() => load()} />}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--border-card)]" />
            ))}
          </div>
        ) : error && rows.length === 0 ? (
          <ErrorState title="Couldn't load picks" message={error} onRetry={() => load()} />
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
                          <span className={`font-semibold ${row.pickTeamAbbrev ? "team-ink" : ""}`} style={pickAccentStyle(row)}>
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
                    className={`mt-2 text-base font-bold ${row.pickTeamAbbrev ? "team-ink" : outcomeClass(row.outcome)}`}
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
  );
}
