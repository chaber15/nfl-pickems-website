import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, X } from "../components/icons";
import type { EarnedBadge, LeaderboardEntry } from "@shared/types";
import { shortWeekLabel } from "@shared/weekUtils";
import { isDisplayableBadgeAward, isSeasonScopedBadge } from "@shared/badges";
import { AppShell } from "../components/AppShell";
import { LeaderboardBadgeTrail } from "../components/BadgeChip";
import { apiLeaderboard } from "../lib/api";
import { useWeek } from "../lib/weekContext";
import {
  isCrowdNameVisible,
  markTutorialDone,
  readTutorialDone,
  setCrowdNameVisible,
} from "../lib/crowdVisibility";

type Scope = "overall" | "week";

function recordLabel(entry: LeaderboardEntry, mode: "winPct" | "pl"): string {
  if (mode === "pl") {
    const c = entry.confCorrect ?? 0;
    const t = entry.confTotal ?? 0;
    return `${c.toFixed(c % 1 === 0 ? 0 : 1)}/${t}`;
  }
  return `${entry.correct.toFixed(entry.correct % 1 === 0 ? 0 : 1)}/${entry.total}`;
}

export function LeaderboardPage() {
  const { seasonType, week, ready } = useWeek();
  const [scope, setScope] = useState<Scope>("overall");
  const [mode, setMode] = useState<"winPct" | "pl">("winPct");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibilityTick, setVisibilityTick] = useState(0);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    setShowTutorial(!readTutorialDone());
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true);
      try {
        const res =
          scope === "overall"
            ? await apiLeaderboard()
            : await apiLeaderboard(seasonType, week);
        setEntries(res.entries);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, scope, seasonType, week]);

  const sorted = useMemo(() => {
    void visibilityTick;
    return [...entries].sort((a, b) =>
      mode === "winPct"
        ? b.winPct - a.winPct || b.confidencePl - a.confidencePl
        : b.confidencePl - a.confidencePl || b.winPct - a.winPct,
    );
  }, [entries, mode, visibilityTick]);

  const toggleLean = (name: string, checked: boolean) => {
    setCrowdNameVisible(name, checked);
    setVisibilityTick((t) => t + 1);
  };

  const dismissTutorial = () => {
    markTutorialDone();
    setShowTutorial(false);
  };

  const badgesForEntry = (entry: LeaderboardEntry): EarnedBadge[] => {
    const all = (entry.badges ?? []).filter((b) =>
      isDisplayableBadgeAward(b.badgeId, b.weekNumber ?? 0),
    );
    if (scope === "week") {
      return all.filter((b) => b.weekNumber === week || isSeasonScopedBadge(b.weekNumber));
    }
    return all;
  };

  const showBadgeTrail = sorted.some((e) => badgesForEntry(e).length > 0);
  const badgeTrailMode = scope === "week" ? "week" : "overall";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        {showTutorial && (
          <div className="relative rounded-2xl border-2 border-[var(--accent-blue)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)]">
            <button
              type="button"
              onClick={dismissTutorial}
              className="absolute right-2 top-2 rounded-full p-2 text-[var(--text-muted)]"
              aria-label="Dismiss"
            >
              <X size={18} weight="bold" />
            </button>
            <p className="pr-8 font-bold">Tip: lean checkboxes</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Uncheck a player to hide their name under the pick color bar on the home page. They
              still count in the bar totals — this only cleans up the name list.
            </p>
            <button
              type="button"
              onClick={dismissTutorial}
              className="mt-3 min-h-10 rounded-xl bg-[var(--accent-blue)] px-4 text-sm font-bold text-white"
            >
              Got it
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-3xl sm:text-4xl">Leaderboard</h2>
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-2xl border-2 border-[var(--border-card)] p-1">
                <button
                  type="button"
                  onClick={() => setScope("overall")}
                  className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${
                    scope === "overall"
                      ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  Overall
                </button>
                <button
                  type="button"
                  onClick={() => setScope("week")}
                  className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${
                    scope === "week"
                      ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  Weekly
                </button>
              </div>
              <div className="flex rounded-2xl border-2 border-[var(--border-card)] p-1">
                <button
                  type="button"
                  onClick={() => setMode("winPct")}
                  className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${
                    mode === "winPct"
                      ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  Win %
                </button>
                <button
                  type="button"
                  onClick={() => setMode("pl")}
                  className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${
                    mode === "pl"
                      ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  Confidence P/L
                </button>
              </div>
            </div>
          </div>

          <p className="text-sm text-[var(--text-muted)]">
            {scope === "overall"
              ? mode === "winPct"
                ? "Overall win % across every final game. Missing a pick counts as wrong."
                : "Overall confidence P/L from eligible weeks only. Record is ★ bets (5 per eligible week)."
              : mode === "winPct"
                ? `Win % for ${shortWeekLabel(seasonType, week)} only.`
                : `Confidence P/L for ${shortWeekLabel(seasonType, week)} only. Record is out of 5 ★ bets.`}{" "}
            Uncheck a player to hide their name on the pick lean — they still count in the bar. Tap a
            name to view their history.
          </p>
        </div>

        {loading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-[var(--border-card)]" />
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
            No leaderboard data yet
            {scope === "week" ? " for this week" : ""}. Make picks and wait for kickoff.
          </div>
        ) : (
          <>
            <div className="hidden overflow-visible rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="w-12 px-4 py-3 text-center font-semibold" title="Show on pick lean">
                      <span className="sr-only">Show on lean</span>✓
                    </th>
                    <th className="px-4 py-3 font-semibold">Rank</th>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">
                      {mode === "winPct" ? "Win %" : "Units P/L"}
                    </th>
                    <th className="px-4 py-3 font-semibold">Record</th>
                    {scope === "overall" && (
                      <th className="px-4 py-3 font-semibold">Weeks</th>
                    )}
                    {showBadgeTrail && <th className="px-4 py-3" aria-hidden="true" />}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((entry, i) => {
                    const rowBadges = badgesForEntry(entry);
                    return (
                      <tr
                        key={entry.userId}
                        className={`whitespace-nowrap border-t border-[var(--border-card)]/60 ${
                          i === 0 ? "bg-[var(--accent-gold)]/10" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            className="size-5 accent-[var(--accent-green)]"
                            checked={isCrowdNameVisible(entry.username)}
                            onChange={(e) => toggleLean(entry.username, e.target.checked)}
                            aria-label={`Show ${entry.username} on pick lean`}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {i + 1}
                          {i === 0 && (
                            <Crown size={16} weight="fill" className="ml-1 inline text-[var(--accent-gold)]" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          <Link
                            to={`/history/${encodeURIComponent(entry.username)}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {entry.displayName || entry.username}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {mode === "winPct"
                            ? `${entry.winPct.toFixed(1)}%`
                            : entry.confidencePl.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 font-mono">{recordLabel(entry, mode)}</td>
                        {scope === "overall" && (
                          <td className="px-4 py-3 font-mono">{entry.weeksComplete}</td>
                        )}
                        {showBadgeTrail && (
                          <td className="max-w-[min(42vw,22rem)] px-4 py-3 align-middle">
                            {rowBadges.length > 0 ? (
                              <LeaderboardBadgeTrail badges={rowBadges} mode={badgeTrailMode} />
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {sorted.map((entry, i) => {
                const rowBadges = badgesForEntry(entry);
                return (
                  <article
                    key={entry.userId}
                    className={`overflow-visible rounded-2xl border-2 p-4 ${
                      i === 0
                        ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                        : "border-[var(--border-card)] bg-[var(--bg-card)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--accent-green)]"
                          checked={isCrowdNameVisible(entry.username)}
                          onChange={(e) => toggleLean(entry.username, e.target.checked)}
                          aria-label={`Show ${entry.username} on pick lean`}
                        />
                        <span className="font-mono text-lg font-bold">#{i + 1}</span>
                      </label>
                      {i === 0 && <Crown size={20} weight="fill" className="text-[var(--accent-gold)]" />}
                    </div>
                    <Link
                      to={`/history/${encodeURIComponent(entry.username)}`}
                      className="mt-2 block text-lg font-bold underline-offset-2 hover:underline"
                    >
                      {entry.displayName || entry.username}
                    </Link>
                    <p className="mt-1 font-mono text-2xl font-bold text-[var(--accent-green)]">
                      {mode === "winPct" ? `${entry.winPct.toFixed(1)}%` : entry.confidencePl.toFixed(2)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {recordLabel(entry, mode)} {mode === "pl" ? "★" : "correct"}
                    </p>
                    {rowBadges.length > 0 && (
                      <div className="mt-2 min-w-0">
                        <LeaderboardBadgeTrail badges={rowBadges} mode={badgeTrailMode} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
