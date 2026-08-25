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
import { AppShell } from "../components/AppShell";
import { FieldFrame } from "../components/FieldFrame";
import { GameCard, GameCardSkeleton } from "../components/GameCard";
import { ConfidenceBetCounter } from "../components/ConfidenceBetCounter";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { getStoredPicks, updateStoredPick } from "../lib/localStorage";
import { loadWeekGames } from "../lib/loadWeekGames";
import { apiGames, apiSavePick, apiUserPicks, apiWeekPicks, isDemoMode } from "../lib/api";
import { crowdLeanForGame } from "../lib/demoCrowd";

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
  const { username, useBackend } = useAuth();
  const { seasonType, week, weekKey, isDemo, ready } = useWeek();
  const [games, setGames] = useState<GameData[]>([]);
  const [picks, setPicks] = useState<Record<string, UserPick>>({});
  const [players, setPlayers] = useState<WeekComparePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickError, setPickError] = useState("");
  const [linesLocked, setLinesLocked] = useState(false);
  const [lockLabel, setLockLabel] = useState<string | null>(null);

  const loadCrowd = useCallback(
    async (_loadedGames: GameData[]) => {
      if (!useBackend || isDemoMode()) {
        setPlayers([]);
        return;
      }
      try {
        const res = await apiWeekPicks(seasonType, week);
        setPlayers(res.players);
      } catch {
        setPlayers([]);
      }
    },
    [useBackend, seasonType, week],
  );

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError("");
    try {
      let loadedGames: GameData[] = [];
      let locked = false;
      let label: string | null = null;

      if (useBackend) {
        try {
          const res = await apiGames(seasonType, week);
          loadedGames = res.games;
          const info = lockInfoForGames(loadedGames);
          locked = info.linesLocked;
          label = info.lockLabel;
        } catch {
          const board = await loadWeekGames(seasonType, week, weekKey);
          loadedGames = board.games;
          locked = board.linesLocked;
          label = board.lockLabel;
        }
      } else {
        const board = await loadWeekGames(seasonType, week, weekKey);
        loadedGames = board.games;
        locked = board.linesLocked;
        label = board.lockLabel;
      }
      setGames(loadedGames);
      setLinesLocked(locked);
      setLockLabel(label);

      if (useBackend) {
        try {
          const res = await apiUserPicks(seasonType, week);
          setPicks(toUserPickMap(res.picks));
        } catch {
          setPicks(getStoredPicks(weekKey));
        }
      } else if (username) {
        setPicks(getStoredPicks(weekKey));
      } else {
        setPicks({});
      }

      await loadCrowd(loadedGames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games");
    } finally {
      setLoading(false);
    }
  }, [useBackend, username, seasonType, week, weekKey, ready, loadCrowd]);

  useEffect(() => {
    void load();
  }, [load]);

  const allLocked = useMemo(
    () => games.length > 0 && games.every((g) => isGameLocked(g.kickoffAt)),
    [games],
  );

  useEffect(() => {
    if (!useBackend || isDemoMode() || allLocked || games.length === 0) return;

    const refreshCrowd = () => {
      if (document.visibilityState !== "visible") return;
      void loadCrowd(games);
    };

    const id = window.setInterval(refreshCrowd, CROWD_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadCrowd(games);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadCrowd, useBackend, games, allLocked]);

  const phase = games[0]?.phase ?? (seasonType === 1 ? "preseason" : seasonType === 3 ? "wildcard" : "regular");
  const demoUnlock = isDemo && allLocked;

  const confCount = useMemo(() => countConfidenceBets(picks), [picks]);
  const pickedCount = useMemo(
    () => games.filter((g) => picks[g.id]?.pick).length,
    [games, picks],
  );
  const unpickedOpen = useMemo(
    () => games.filter((g) => (!isGameLocked(g.kickoffAt) || demoUnlock) && !picks[g.id]?.pick).length,
    [games, picks, demoUnlock],
  );
  const unpickedLocked = useMemo(
    () => games.filter((g) => isGameLocked(g.kickoffAt) && !demoUnlock && !picks[g.id]?.pick).length,
    [games, picks, demoUnlock],
  );

  const weekReady =
    games.length > 0 &&
    pickedCount === games.length &&
    (isPlayoffPhase(phase) || confCount === 5 || phase === "preseason");

  const handlePick = async (gameId: string, side: PickSide) => {
    setPickError("");
    if (useBackend) {
      try {
        await apiSavePick({ gameId, pick: side });
        void loadCrowd(games);
      } catch (err) {
        setPickError(err instanceof Error ? err.message : "Failed to save pick");
        return;
      }
    }
    if (username) {
      const next = updateStoredPick(weekKey, username, gameId, {
        pick: side,
        isConfidenceBet: isPlayoffPhase(phase) ? true : picks[gameId]?.isConfidenceBet ?? false,
      });
      setPicks({ ...next });
    }
  };

  const handleConfidence = async (gameId: string) => {
    const current = picks[gameId];
    if (!current?.pick) return;
    if (!current.isConfidenceBet && confCount >= 5) return;

    if (useBackend) {
      try {
        await apiSavePick({ gameId, action: "toggle_confidence" });
        void loadCrowd(games);
      } catch {
        /* local fallback */
      }
    }
    if (username) {
      const next = updateStoredPick(weekKey, username, gameId, {
        isConfidenceBet: !current.isConfidenceBet,
      });
      setPicks({ ...next });
    }
  };

  return (
    <AppShell games={games}>
      <FieldFrame>
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
          {demoUnlock && (
            <div className="rounded-2xl border-2 border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 px-4 py-3 text-sm font-semibold">
              Demo unlock: these games are final on ESPN. Picks stay editable so you can try the UI.
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
                forceUnlocked={demoUnlock}
                crowd={crowdLeanForGame(game, players, username)}
              />
            ))}
          </div>
        )}
      </div>
      </FieldFrame>
    </AppShell>
  );
}
