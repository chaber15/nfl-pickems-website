import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GameData } from "@shared/types";
import { sortGamesLiveFirstThenChronological } from "@shared/gameOrder";
import { apiGames, errorMessage } from "./api";
import { useAuth } from "./authContext";
import { usePageVisible, useTabReturn } from "./visibility";
import { useWeek } from "./weekContext";
import { isPostponed } from "./gameStatus";

/** While a game is live (and the tab is visible) refresh scores this often. Server/CDN caches /api/games. */
const LIVE_REFRESH_MS = 120_000;
/** Returning to the tab only refetches if the data is at least this old. */
const STALE_ON_RETURN_MS = 60_000;
/** A kicked-off game still marked "scheduled" is treated as live-ish for this long (ESPN lag). */
const LIVE_GRACE_MS = 6 * 60 * 60 * 1000;

export const weekKeyOf = (seasonType: number, week: number) => `${seasonType}-${week}`;

interface GamesState {
  /** Week these games belong to (`seasonType-week`); null before the first load. */
  key: string | null;
  games: GameData[];
  error: string | null;
  loadedAt: number;
}

interface GamesContextValue {
  /** Key of the currently selected week. Compare with `state.key` before trusting `games`. */
  currentKey: string;
  key: string | null;
  games: GameData[];
  /** True until this week's first answer (success or error) arrives. */
  loading: boolean;
  /** A request for this week is in flight (initial, retry, or live refresh). */
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Changes at each kickoff so lock state is re-evaluated. */
  clockTick: number;
}

const GamesContext = createContext<GamesContextValue | null>(null);

/** Any game that is live, or has kicked off but ESPN hasn't flipped to live/final yet. */
export function hasLiveGames(games: GameData[], now = Date.now()): boolean {
  return games.some((g) => {
    if (g.status === "in_progress") return true;
    if (g.status !== "scheduled" || isPostponed(g)) return false;
    const kick = new Date(g.kickoffAt).getTime();
    return kick <= now && now - kick < LIVE_GRACE_MS;
  });
}

/**
 * Games for the selected week, shared by the Picks page and the score ticker.
 * One fetch per week change; live refresh only while a game is on and the tab is visible.
 */
export function GamesProvider({ children }: { children: ReactNode }) {
  const { username } = useAuth();
  const { seasonType, week, ready } = useWeek();
  const visible = usePageVisible();
  const currentKey = weekKeyOf(seasonType, week);
  const [state, setState] = useState<GamesState>({ key: null, games: [], error: null, loadedAt: 0 });
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const reqRef = useRef(0);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(async () => {
    if (!ready || !username) return;
    const id = ++reqRef.current;
    const key = weekKeyOf(seasonType, week);
    setLoadingKey(key);
    try {
      const res = await apiGames(seasonType, week);
      if (id !== reqRef.current) return;
      setState({
        key,
        games: sortGamesLiveFirstThenChronological(res.games),
        error: null,
        loadedAt: Date.now(),
      });
    } catch (err) {
      if (id !== reqRef.current) return;
      setState((prev) =>
        // Keep showing the last good data for the same week on a failed background refresh.
        prev.key === key && prev.games.length > 0
          ? { ...prev, error: errorMessage(err, "Couldn't load games") }
          : { key, games: [], error: errorMessage(err, "Couldn't load games"), loadedAt: Date.now() },
      );
    } finally {
      if (id === reqRef.current) setLoadingKey(null);
    }
  }, [ready, username, seasonType, week]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-render consumers at each kickoff (picks lock, live refresh may start) — one timer to
  // the next kickoff instead of a per-second interval.
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    let next = Infinity;
    for (const g of state.games) {
      const t = new Date(g.kickoffAt).getTime();
      if (t > now && t < next) next = t;
    }
    if (!Number.isFinite(next)) return;
    // Cap long waits (setTimeout overflows past ~24 days; tabs also sleep).
    const delay = Math.min(next - now + 250, 6 * 60 * 60 * 1000);
    const id = window.setTimeout(() => setClockTick((t) => t + 1), delay);
    return () => window.clearTimeout(id);
  }, [state.games, clockTick]);

  // clockTick is read so `live` re-evaluates after a kickoff passes.
  const live = clockTick >= 0 && state.key === currentKey && hasLiveGames(state.games);

  useEffect(() => {
    if (!live || !visible) return;
    const id = window.setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, visible, load]);

  useTabReturn(() => {
    setClockTick((t) => t + 1);
    const s = stateRef.current;
    if (s.key !== currentKey || s.error) {
      void load();
      return;
    }
    const allFinal = s.games.length > 0 && s.games.every((g) => g.status === "final");
    if (!allFinal && Date.now() - s.loadedAt >= STALE_ON_RETURN_MS) void load();
  }, ready && !!username);

  const value = useMemo<GamesContextValue>(
    () => ({
      currentKey,
      key: state.key,
      games: state.key === currentKey ? state.games : [],
      loading: state.key !== currentKey,
      refreshing: loadingKey === currentKey,
      error: state.key === currentKey ? state.error : null,
      refresh: load,
      clockTick,
    }),
    [currentKey, state, loadingKey, load, clockTick],
  );

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}

export function useGames() {
  const ctx = useContext(GamesContext);
  if (!ctx) throw new Error("useGames must be used within GamesProvider");
  return ctx;
}
