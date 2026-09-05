import { useEffect, useId, useRef, useState } from "react";
import { Question } from "@phosphor-icons/react";
import type { GameData, UserStats } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { apiStats } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { getStoredPicks } from "../lib/localStorage";
import { loadWeekGames } from "../lib/loadWeekGames";
import { computeUserStats } from "@shared/statsCompute";

function StatCard({ label, value, help }: { label: string; value: string; help: string }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("right");
  const rootRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    const card = rootRef.current;
    if (card) {
      const rect = card.getBoundingClientRect();
      // Left-column cards: grow right so the bubble isn’t clipped by the screen edge
      setAlign(rect.left < window.innerWidth / 2 ? "left" : "right");
    }
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-4"
    >
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-page)] hover:text-[var(--accent-blue)]"
      >
        <Question size={18} weight="bold" />
      </button>
      <p className="pr-8 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-bold text-[var(--accent-green)]">{value}</p>
      {open && (
        <div
          id={tipId}
          role="tooltip"
          className={`absolute top-10 z-30 w-[min(16rem,calc(100vw-2.5rem))] rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text-primary)] shadow-[var(--shadow-card)] ${
            align === "left" ? "left-1" : "right-1"
          }`}
        >
          {help}
        </div>
      )}
    </div>
  );
}

const STAT_HELP = {
  winPctAll:
    "Your overall against-the-spread (ATS) win rate on every final game. Missed picks count as wrong.",
  winPctConfidence:
    "ATS win rate on your ★ confidence bets only (eligible weeks / playoffs).",
  confidencePl:
    "Units won or lost on ★ confidence bets using the posted juice. Only weeks with exactly 5 ★ bets count (playoffs: all games).",
  hypotheticalPl:
    "What your P/L would be if every pick counted at the posted odds. Each missed game costs 1 unit.",
  confidenceRoi:
    "Return on investment for confidence bets: profit ÷ risk across eligible ★ weeks.",
  hypotheticalRoi:
    "Return on investment if you had bet every game (including the −1 for misses).",
  favoritePickRate: "How often you pick the favorite when you make a pick.",
  underdogPickRate: "How often you pick the underdog when you make a pick.",
  favoriteHitRate: "How often your favorite picks cover the spread (among graded favorite picks).",
  underdogHitRate: "How often your underdog picks cover the spread (among graded underdog picks).",
  favoriteUnits: "Units won or lost on favorite picks only (hypothetical track).",
  underdogUnits: "Units won or lost on underdog picks only (hypothetical track).",
  streakAll: "Current streak of non-losing results on all graded picks (wins and pushes).",
  streakConfidence: "Current streak on ★ confidence bets only.",
  bestWeek: "Your best eligible week by confidence P/L.",
  worstWeek: "Your worst eligible week by confidence P/L.",
} as const;

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
        const board = await loadWeekGames(seasonType, week, weekKey);
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
              <StatCard
                label="Win % (all picks)"
                value={`${stats.winPctAll.toFixed(1)}%`}
                help={STAT_HELP.winPctAll}
              />
              <StatCard
                label="Win % (confidence)"
                value={`${stats.winPctConfidence.toFixed(1)}%`}
                help={STAT_HELP.winPctConfidence}
              />
              <StatCard
                label="Confidence P/L"
                value={stats.confidencePl.toFixed(2)}
                help={STAT_HELP.confidencePl}
              />
              <StatCard
                label="Hypothetical P/L"
                value={stats.hypotheticalPl.toFixed(2)}
                help={STAT_HELP.hypotheticalPl}
              />
              <StatCard
                label="Confidence ROI"
                value={`${stats.confidenceRoi.toFixed(1)}%`}
                help={STAT_HELP.confidenceRoi}
              />
              <StatCard
                label="Hypothetical ROI"
                value={`${stats.hypotheticalRoi.toFixed(1)}%`}
                help={STAT_HELP.hypotheticalRoi}
              />
              <StatCard
                label="Favorite pick rate"
                value={`${stats.favoritePickRate.toFixed(0)}%`}
                help={STAT_HELP.favoritePickRate}
              />
              <StatCard
                label="Underdog pick rate"
                value={`${stats.underdogPickRate.toFixed(0)}%`}
                help={STAT_HELP.underdogPickRate}
              />
              <StatCard
                label="Favorite hit rate"
                value={`${stats.favoriteHitRate.toFixed(0)}%`}
                help={STAT_HELP.favoriteHitRate}
              />
              <StatCard
                label="Underdog hit rate"
                value={`${stats.underdogHitRate.toFixed(0)}%`}
                help={STAT_HELP.underdogHitRate}
              />
              <StatCard
                label="Favorite units"
                value={stats.favoriteUnits.toFixed(2)}
                help={STAT_HELP.favoriteUnits}
              />
              <StatCard
                label="Underdog units"
                value={stats.underdogUnits.toFixed(2)}
                help={STAT_HELP.underdogUnits}
              />
              <StatCard
                label="Streak (all)"
                value={String(stats.currentStreakAll)}
                help={STAT_HELP.streakAll}
              />
              <StatCard
                label="Streak (confidence)"
                value={String(stats.currentStreakConfidence)}
                help={STAT_HELP.streakConfidence}
              />
              <StatCard
                label="Best week P/L"
                value={
                  stats.bestWeekConfidence
                    ? `W${stats.bestWeekConfidence.week}: ${stats.bestWeekConfidence.pl.toFixed(2)}`
                    : "-"
                }
                help={STAT_HELP.bestWeek}
              />
              <StatCard
                label="Worst week P/L"
                value={
                  stats.worstWeekConfidence
                    ? `W${stats.worstWeekConfidence.week}: ${stats.worstWeekConfidence.pl.toFixed(2)}`
                    : "-"
                }
                help={STAT_HELP.worstWeek}
              />
            </div>

            <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6">
              <h3 className="mb-4 font-bold">P/L Tracks</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-muted)]">Confidence P/L</p>
                  <p className="font-mono text-xl font-bold">{stats.confidencePl.toFixed(2)} units</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    From eligible weeks only: exactly 5 ★ bets (regular season), or all playoff games.
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
                        {!row.plEligible &&
                        row.phase !== "wildcard" &&
                        row.phase !== "divisional" &&
                        row.phase !== "conf" &&
                        row.phase !== "superbowl"
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
