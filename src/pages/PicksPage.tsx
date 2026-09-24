import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONFIDENCE_BETS_PER_WEEK,
  type PickSide,
  type UserPick,
  type WeekComparePlayer,
  type WeekPhase,
} from "@shared/types";
import { countConfidenceBets, isGameLocked, isPlayoffPhase } from "@shared/scoring";
import { formatLineLockLabel } from "@shared/lineLock";
import { toUserPickMap } from "@shared/statsCompute";
import { GameCard } from "../components/game/GameCard";
import { GameCardSkeleton } from "../components/game/GameCardSkeleton";
import { ConfidenceBetCounter } from "../components/ConfidenceBetCounter";
import { ErrorState } from "../components/ErrorState";
import { HelpTip, JUICE_HELP } from "../components/HelpTip";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { useGames, weekKeyOf } from "../lib/gamesContext";
import { apiSavePick, apiUserPicks, apiWeekPicks, errorMessage } from "../lib/api";
import { crowdLeanForGame } from "../lib/crowdLean";
import { weekLineLock } from "../lib/gameStatus";
import { usePageVisible, useTabReturn } from "../lib/visibility";

/** Crowd lean refresh while picks can still change (tab visible only). */
const CROWD_POLL_MS = 60_000;

type PicksState = { key: string | null; picks: Record<string, UserPick>; error: string | null };
type CrowdState = { key: string | null; players: WeekComparePlayer[]; error: string | null };

export function PicksPage() {
  const { username } = useAuth();
  const { seasonType, week, ready } = useWeek();
  const gamesCtx = useGames();
  const key = gamesCtx.currentKey;
  const visible = usePageVisible();

  const [picksState, setPicksState] = useState<PicksState>({ key: null, picks: {}, error: null });
  const [crowdState, setCrowdState] = useState<CrowdState>({ key: null, players: [], error: null });
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const savingRef = useRef(new Set<string>());
  const picksReq = useRef(0);
  const crowdReq = useRef(0);

  const loadPicks = useCallback(async () => {
    if (!ready) return;
    const id = ++picksReq.current;
    const k = weekKeyOf(seasonType, week);
    try {
      const res = await apiUserPicks(seasonType, week);
      if (id !== picksReq.current) return;
      setPicksState({ key: k, picks: toUserPickMap(res.picks), error: null });
    } catch (err) {
      if (id !== picksReq.current) return;
      setPicksState({ key: k, picks: {}, error: errorMessage(err, "Couldn't load your picks") });
    }
  }, [ready, seasonType, week]);

  const loadCrowd = useCallback(async () => {
    if (!ready) return;
    const id = ++crowdReq.current;
    const k = weekKeyOf(seasonType, week);
    try {
      const res = await apiWeekPicks(seasonType, week);
      if (id !== crowdReq.current) return;
      setCrowdState({ key: k, players: res.players, error: null });
    } catch (err) {
      if (id !== crowdReq.current) return;
      setCrowdState((prev) => ({
        key: k,
        players: prev.key === k ? prev.players : [],
        error: errorMessage(err, "Couldn't load everyone's picks"),
      }));
    }
  }, [ready, seasonType, week]);

  useEffect(() => {
    setCardErrors({});
    void loadPicks();
    void loadCrowd();
  }, [loadPicks, loadCrowd]);

  // Picks and games are shown together only once both belong to the selected week.
  const picksReady = picksState.key === key;
  const contentReady = ready && !gamesCtx.loading && picksReady;
  const games = contentReady ? gamesCtx.games : [];
  const picks = useMemo(() => (contentReady ? picksState.picks : {}), [contentReady, picksState.picks]);
  const players = crowdState.key === key ? crowdState.players : [];

  // gamesCtx.clockTick changes at each kickoff, so locks re-evaluate without a per-second timer.
  const clockTick = gamesCtx.clockTick;
  const allLocked = useMemo(
    () => clockTick >= 0 && games.length > 0 && games.every((g) => isGameLocked(g.kickoffAt)),
    [games, clockTick],
  );

  useEffect(() => {
    if (!contentReady || allLocked || games.length === 0 || !visible) return;
    const id = window.setInterval(() => void loadCrowd(), CROWD_POLL_MS);
    return () => window.clearInterval(id);
  }, [contentReady, allLocked, games.length, visible, loadCrowd]);

  useTabReturn(() => {
    if (allLocked) return;
    void loadCrowd();
    if (savingRef.current.size === 0) void loadPicks();
  }, contentReady);

  const phase: WeekPhase = games[0]?.phase ?? (seasonType === 3 ? "wildcard" : "regular");
  const playoffs = isPlayoffPhase(phase);
  const lineLock = useMemo(() => weekLineLock(games), [games]);

  const confCount = useMemo(() => countConfidenceBets(picks), [picks]);
  const pickedCount = games.filter((g) => picks[g.id]?.pick).length;
  const unpickedOpen = games.filter((g) => !isGameLocked(g.kickoffAt) && !picks[g.id]?.pick).length;
  const unpickedLocked = games.filter((g) => isGameLocked(g.kickoffAt) && !picks[g.id]?.pick).length;
  const weekReady =
    games.length > 0 &&
    pickedCount === games.length &&
    (playoffs || confCount === CONFIDENCE_BETS_PER_WEEK);

  /** Write one game's pick, but only into the week it was made for. */
  const setPickFor = (k: string, gameId: string, value: UserPick | null) => {
    setPicksState((s) => {
      if (s.key !== k) return s;
      const next = { ...s.picks };
      if (value) next[gameId] = value;
      else delete next[gameId];
      return { ...s, picks: next };
    });
  };

  /** Mirror your saved pick into the crowd lean without another request. */
  const patchCrowd = (k: string, gameId: string, value: UserPick) => {
    if (!username || !value.pick) return false;
    const me = username.toLowerCase();
    const isMe = (p: WeekComparePlayer) => p.username.toLowerCase() === me;
    if (crowdState.key !== k || !crowdState.players.some(isMe)) return false;
    const pick = value.pick;
    setCrowdState((s) =>
      s.key !== k
        ? s
        : {
            ...s,
            players: s.players.map((p) =>
              isMe(p)
                ? { ...p, picks: { ...p.picks, [gameId]: { pick, isConfidenceBet: value.isConfidenceBet } } }
                : p,
            ),
          },
    );
    return true;
  };

  const setCardError = (gameId: string, message: string | null) => {
    setCardErrors((prev) => {
      if (!message) {
        if (!(gameId in prev)) return prev;
        const next = { ...prev };
        delete next[gameId];
        return next;
      }
      return { ...prev, [gameId]: message };
    });
  };

  const markSaving = (gameId: string, on: boolean) => {
    if (on) savingRef.current.add(gameId);
    else savingRef.current.delete(gameId);
    setSaving((prev) => {
      const next = { ...prev };
      if (on) next[gameId] = true;
      else delete next[gameId];
      return next;
    });
  };

  /** Optimistic save with rollback; one request per card at a time. */
  const save = async (
    gameId: string,
    optimistic: UserPick,
    body: Parameters<typeof apiSavePick>[0],
    fallbackError: string,
  ) => {
    if (savingRef.current.has(gameId)) return;
    const k = key;
    const previous = picks[gameId] ?? null;
    setPickFor(k, gameId, optimistic);
    markSaving(gameId, true);
    try {
      const saved = await apiSavePick(body);
      const final: UserPick = saved ? { gameId, ...saved } : optimistic;
      setPickFor(k, gameId, final);
      setCardError(gameId, null);
      if (!patchCrowd(k, gameId, final)) void loadCrowd();
    } catch (err) {
      setPickFor(k, gameId, previous);
      setCardError(gameId, errorMessage(err, fallbackError));
    } finally {
      markSaving(gameId, false);
    }
  };

  const handlePick = (gameId: string, side: PickSide) => {
    const current = picks[gameId];
    if (current?.pick === side) return;
    void save(
      gameId,
      { gameId, pick: side, isConfidenceBet: playoffs ? true : (current?.isConfidenceBet ?? false) },
      { gameId, pick: side },
      "Couldn't save your pick. Please try again.",
    );
  };

  const handleConfidence = (gameId: string, value: boolean) => {
    const current = picks[gameId];
    if (!current?.pick) return;
    if (value && confCount >= CONFIDENCE_BETS_PER_WEEK) return;
    if (current.isConfidenceBet === value) return;
    void save(
      gameId,
      { ...current, isConfidenceBet: value },
      { gameId, action: "set_confidence", value },
      "Couldn't update your ★ bet. Please try again.",
    );
  };

  const retryAll = async () => {
    await Promise.all([gamesCtx.error ? gamesCtx.refresh() : Promise.resolve(), loadPicks()]);
  };

  const loadError = gamesCtx.error && gamesCtx.games.length === 0 ? gamesCtx.error : picksState.key === key ? picksState.error : null;
  const showSkeleton = !loadError && !contentReady;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <h2 className="font-display text-3xl sm:text-4xl">Make Your Picks</h2>
        {contentReady && games.length > 0 && (
          <>
            <ConfidenceBetCounter count={confCount} phase={phase} />
            {lineLock.lockAt && (
              <div
                className={`rounded-2xl border-2 px-4 py-3 text-sm ${
                  lineLock.linesLocked
                    ? "border-[var(--border-card)] bg-[var(--bg-card-elevated)] font-semibold"
                    : "border-dashed border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-muted)]"
                }`}
              >
                {lineLock.linesLocked ? (
                  <>Line locked since {formatLineLockLabel(lineLock.lockAt)}. Everyone bets the same spread &amp; juice. </>
                ) : (
                  <>Line not final — spreads &amp; juice can move until {formatLineLockLabel(lineLock.lockAt)}, then lock for the week. </>
                )}
                <HelpTip label="What is juice?">{JUICE_HELP}</HelpTip>
              </div>
            )}
            {weekReady && (
              <div className="rounded-2xl border-2 border-[var(--accent-green)] bg-[var(--accent-green)]/15 px-4 py-3 text-sm font-bold text-[var(--accent-green)]">
                All picks in
              </div>
            )}
            <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 text-sm font-semibold">
              <span className="font-mono">
                {pickedCount}/{games.length}
              </span>{" "}
              games picked
              {unpickedOpen > 0 && (
                <span className="text-[var(--accent-red)]"> - {unpickedOpen} will count as wrong at kickoff</span>
              )}
              {unpickedLocked > 0 && (
                <span className="text-[var(--accent-red)]"> - {unpickedLocked} missed picks graded wrong</span>
              )}
            </div>
          </>
        )}
      </div>

      {loadError ? (
        <ErrorState title="Couldn't load this week" message={loadError} onRetry={retryAll} />
      ) : showSkeleton ? (
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
        <>
          {gamesCtx.error && (
            <ErrorState compact message={`Scores may be out of date. ${gamesCtx.error}`} onRetry={gamesCtx.refresh} />
          )}
          {crowdState.key === key && crowdState.error && (
            <ErrorState compact message={crowdState.error} onRetry={loadCrowd} />
          )}
          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
            {games.map((game, index) => {
              const pairIndex = index % 2 === 0 ? index + 1 : index - 1;
              const neighbor = pairIndex >= 0 && pairIndex < games.length ? games[pairIndex] : null;
              const neighborOpen = neighbor != null && !isGameLocked(neighbor.kickoffAt);
              const selfLocked = isGameLocked(game.kickoffAt);
              // Desktop 2-col: shorter locked cards fill empty row height when beside open picks.
              const expandCrowdNames = selfLocked && neighborOpen;

              return (
                <GameCard
                  key={game.id}
                  game={game}
                  userPick={picks[game.id]}
                  onPick={(side) => handlePick(game.id, side)}
                  onSetConfidence={(value) => handleConfidence(game.id, value)}
                  confidenceDisabled={!picks[game.id]?.isConfidenceBet && confCount >= CONFIDENCE_BETS_PER_WEEK}
                  crowd={crowdLeanForGame(game, players, username)}
                  expandCrowdNames={expandCrowdNames}
                  saving={saving[game.id] ?? false}
                  error={cardErrors[game.id] ?? null}
                  lineLockAt={lineLock.lockAt}
                  lineLockPassed={lineLock.pastLock}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
