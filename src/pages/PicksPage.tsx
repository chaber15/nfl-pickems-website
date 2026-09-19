import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameData, PickSide, UserPick, WeekComparePlayer } from "@shared/types";
import { countConfidenceBets, isGameLocked, isPlayoffPhase } from "@shared/scoring";
import {
  computeLineLockAt,
  formatLineLockLabel,
  hasCompleteLine,
  isPastLineLock,
  snapshotLine,
} from "@shared/lineLock";
import { toUserPickMap } from "@shared/statsCompute";
import { sortGamesLiveFirstThenChronological } from "@shared/gameOrder";
import { AppShell } from "../components/AppShell";
import { GameCard, GameCardSkeleton } from "../components/GameCard";
import { ConfidenceBetCounter } from "../components/ConfidenceBetCounter";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { apiGames, apiSavePick, apiUserPicks, apiWeekPicks } from "../lib/api";
import { crowdLeanForGame } from "../lib/crowdLean";

/** Crowd lean refresh while picks can still change (tab visible only). */
const CROWD_POLL_MS = 60_000;

function lockInfoForGames(games: GameData[]) {
  const lockAt = computeLineLockAt(games.map((g) => g.kickoffAt));
  const locked =
    isPastLineLock(lockAt) && games.some((g) => hasCompleteLine(snapshotLine(g)));
  return {
    linesLocked: locked,
    lockLabel: lockAt ? formatLineLockLabel(lockAt) : null,
  };
}

export function PicksPage() {
  const { username } = useAuth();
  const { seasonType, week, ready } = useWeek();
  const [games, setGames] = useState<GameData[]>([]);
  const [picks, setPicks] = useState<Record<string, UserPick>>({});
  const [players, setPlayers] = useState<WeekComparePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickError, setPickError] = useState("");
  const [linesLocked, setLinesLocked] = useState(false);
  const [lockLabel, setLockLabel] = useState<string | null>(null);

  const loadCrowd = useCallback(async () => {
    try {
      const res = await apiWeekPicks(seasonType, week);
      setPlayers(res.players);
    } catch {
      setPlayers([]);
    }
  }, [seasonType, week]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiGames(seasonType, week);
      const loadedGames = sortGamesLiveFirstThenChronological(res.games);
      const info = lockInfoForGames(loadedGames);
      setGames(loadedGames);
      setLinesLocked(info.linesLocked);
      setLockLabel(info.lockLabel);

      const picksRes = await apiUserPicks(seasonType, week);
      setPicks(toUserPickMap(picksRes.picks));
      await loadCrowd();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games");
    } finally {
      setLoading(false);
    }
  }, [seasonType, week, ready, loadCrowd]);

  useEffect(() => {
    void load();
  }, [load]);

  const allLocked = useMemo(
    () => games.length > 0 && games.every((g) => isGameLocked(g.kickoffAt)),
    [games],
  );

  useEffect(() => {
    if (allLocked || games.length === 0) return;

    const refreshCrowd = () => {
      if (document.visibilityState !== "visible") return;
      void loadCrowd();
    };

    const id = window.setInterval(refreshCrowd, CROWD_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadCrowd();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadCrowd, games, allLocked]);

  const phase = games[0]?.phase ?? (seasonType === 1 ? "preseason" : seasonType === 3 ? "wildcard" : "regular");

  const confCount = useMemo(() => countConfidenceBets(picks), [picks]);
  const pickedCount = useMemo(
    () => games.filter((g) => picks[g.id]?.pick).length,
    [games, picks],
  );
  const unpickedOpen = useMemo(
    () => games.filter((g) => !isGameLocked(g.kickoffAt) && !picks[g.id]?.pick).length,
    [games, picks],
  );
  const unpickedLocked = useMemo(
    () => games.filter((g) => isGameLocked(g.kickoffAt) && !picks[g.id]?.pick).length,
    [games, picks],
  );

  const weekReady =
    games.length > 0 &&
    pickedCount === games.length &&
    (isPlayoffPhase(phase) || confCount === 5 || phase === "preseason");

  const applyPickUpdate = (gameId: string, update: Partial<UserPick>) => {
    setPicks((prev) => {
      const existing = prev[gameId] ?? { gameId, pick: null, isConfidenceBet: false };
      return {
        ...prev,
        [gameId]: { ...existing, ...update, gameId },
      };
    });
  };

  const handlePick = async (gameId: string, side: PickSide) => {
    setPickError("");
    try {
      await apiSavePick({ gameId, pick: side });
      void loadCrowd();
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Failed to save pick");
      return;
    }
    applyPickUpdate(gameId, {
      pick: side,
      isConfidenceBet: isPlayoffPhase(phase) ? true : picks[gameId]?.isConfidenceBet ?? false,
    });
  };

  const handleConfidence = async (gameId: string) => {
    const current = picks[gameId];
    if (!current?.pick) return;
    if (!current.isConfidenceBet && confCount >= 5) return;

    const nextConf = !current.isConfidenceBet;
    try {
      await apiSavePick({ gameId, action: "toggle_confidence" });
      void loadCrowd();
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Failed to update confidence bet");
      return;
    }
    applyPickUpdate(gameId, { isConfidenceBet: nextConf });
  };

  return (
    <AppShell games={games}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <h2 className="font-display text-3xl sm:text-4xl">Make Your Picks</h2>
          <ConfidenceBetCounter count={confCount} phase={phase} />
          {linesLocked && lockLabel && (
            <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-4 py-3 text-sm font-semibold">
              Spread &amp; juice locked since {lockLabel}. Everyone bets the same line.
            </div>
          )}
          {!linesLocked && lockLabel && (
            <div className="rounded-2xl border-2 border-dashed border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-muted)]">
              Lines update until {lockLabel}, then freeze for the week.
            </div>
          )}
          {weekReady && (
            <div className="rounded-2xl border-2 border-[var(--accent-green)] bg-[var(--accent-green)]/15 px-4 py-3 text-sm font-bold text-[var(--accent-green)]">
              READY FOR SUNDAY
            </div>
          )}
          <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 text-sm font-semibold">
            <span className="font-mono">
              {pickedCount}/{games.length}
            </span>{" "}
            games picked
            {unpickedOpen > 0 && (
              <span className="text-[var(--accent-red)]">
                {" "}
                - {unpickedOpen} will count as wrong at kickoff
              </span>
            )}
            {unpickedLocked > 0 && (
              <span className="text-[var(--accent-red)]">
                {" "}
                - {unpickedLocked} missed picks graded wrong
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-4 py-3 text-sm font-semibold text-[var(--accent-red)]">
            {error}
          </div>
        )}
        {pickError && (
          <div className="rounded-2xl border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-4 py-3 text-sm font-semibold text-[var(--accent-red)]">
            {pickError}
          </div>
        )}

        {loading || !ready ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <GameCardSkeleton key={i} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
            <p className="font-semibold">No games yet</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Check back when ESPN posts the slate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                userPick={picks[game.id]}
                onPick={(side) => handlePick(game.id, side)}
                onToggleConfidence={() => handleConfidence(game.id)}
                confidenceDisabled={!picks[game.id]?.isConfidenceBet && confCount >= 5}
                crowd={crowdLeanForGame(game, players, username)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
