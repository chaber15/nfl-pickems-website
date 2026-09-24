import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveCurrentPickemsWeek } from "@shared/espnClient";
import { DEFAULT_SEASON_TYPE, DEFAULT_WEEK } from "@shared/types";
import {
  clampToAvailableWeek,
  isAfterTuesdayNoonEt,
  nextAvailableWeek,
  weekOptionIndex,
} from "@shared/weekUtils";

interface WeekContextValue {
  seasonType: number;
  week: number;
  /** False until the default week is known (or the URL / user picked one). */
  ready: boolean;
  setWeekSelection: (seasonType: number, week: number) => void;
}

type WeekSel = { seasonType: number; week: number };

const WeekContext = createContext<WeekContextValue | null>(null);

function fallbackDefaultWeek(): WeekSel {
  if (isAfterTuesdayNoonEt()) {
    return nextAvailableWeek(DEFAULT_SEASON_TYPE, DEFAULT_WEEK);
  }
  return { seasonType: DEFAULT_SEASON_TYPE, week: DEFAULT_WEEK };
}

/** `?seasonType=2&week=3` → selection, or null when missing / not an offered week. */
function weekFromSearch(search: string): WeekSel | null {
  const params = new URLSearchParams(search);
  const st = Number(params.get("seasonType") ?? "2");
  const wk = Number(params.get("week"));
  if (!params.has("week") || !Number.isInteger(st) || !Number.isInteger(wk)) return null;
  if (weekOptionIndex(st, wk) < 0) return null;
  return { seasonType: st, week: wk };
}

function sameWeek(a: WeekSel | null, b: WeekSel | null) {
  return a != null && b != null && a.seasonType === b.seasonType && a.week === b.week;
}

/** Routes where the week has no meaning — don't put it in their URL. */
const WEEKLESS_PATHS = new Set(["/how-to-play"]);

export function WeekProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const fromUrl = useMemo(() => weekFromSearch(location.search), [location.search]);
  const initialUrlRef = useRef(fromUrl);
  const [sel, setSel] = useState<WeekSel>(() => initialUrlRef.current ?? fallbackDefaultWeek());
  const [ready, setReady] = useState(initialUrlRef.current != null);
  /** Once the user (or a shared link) chooses a week, the auto-detected default must not override it. */
  const chosenRef = useRef(initialUrlRef.current != null);
  /** Last week we wrote to / read from the URL — tells our own writes apart from back/forward. */
  const syncedRef = useRef<WeekSel | null>(initialUrlRef.current);

  useEffect(() => {
    if (chosenRef.current) return;
    let cancelled = false;
    (async () => {
      let next: WeekSel;
      try {
        const current = await resolveCurrentPickemsWeek();
        next = clampToAvailableWeek(current.seasonType, current.week);
      } catch {
        next = fallbackDefaultWeek();
      }
      if (cancelled) return;
      if (!chosenRef.current) setSel(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // URL ⇄ state sync: adopt a week that arrives via the URL (back button, pasted link);
  // otherwise write the current week into the URL (replace, so history isn't spammed).
  useEffect(() => {
    if (fromUrl && !sameWeek(fromUrl, sel) && !sameWeek(fromUrl, syncedRef.current)) {
      chosenRef.current = true;
      syncedRef.current = fromUrl;
      setSel(fromUrl);
      setReady(true);
      return;
    }
    if (!ready || WEEKLESS_PATHS.has(location.pathname)) return;
    if (sameWeek(fromUrl, sel)) {
      syncedRef.current = sel;
      return;
    }
    const params = new URLSearchParams(location.search);
    params.set("seasonType", String(sel.seasonType));
    params.set("week", String(sel.week));
    syncedRef.current = sel;
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
      { replace: true },
    );
  }, [fromUrl, sel, ready, location.pathname, location.search, location.hash, navigate]);

  const setWeekSelection = useCallback((nextSeasonType: number, nextWeek: number) => {
    chosenRef.current = true;
    setSel(clampToAvailableWeek(nextSeasonType, nextWeek));
    setReady(true);
  }, []);

  const value = useMemo<WeekContextValue>(
    () => ({ seasonType: sel.seasonType, week: sel.week, ready, setWeekSelection }),
    [sel, ready, setWeekSelection],
  );

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek() {
  const ctx = useContext(WeekContext);
  if (!ctx) throw new Error("useWeek must be used within WeekProvider");
  return ctx;
}

/** Link target that keeps the selected week in the URL. */
export function useWeekSearch(): string {
  const { seasonType, week, ready } = useWeek();
  return ready ? `?seasonType=${seasonType}&week=${week}` : "";
}
