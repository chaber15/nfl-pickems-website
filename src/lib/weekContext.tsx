import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveCurrentPickemsWeek } from "@shared/espnClient";
import { DEFAULT_SEASON_TYPE, DEFAULT_WEEK } from "@shared/types";
import {
  clampToAvailableWeek,
  isAfterTuesdayNoonEt,
  nextAvailableWeek,
  weekLabel,
  weekStorageKey,
} from "@shared/weekUtils";

interface WeekContextValue {
  seasonType: number;
  week: number;
  weekKey: string;
  label: string;
  ready: boolean;
  setWeekSelection: (seasonType: number, week: number) => void;
}

const WeekContext = createContext<WeekContextValue | null>(null);

function fallbackDefaultWeek(): { seasonType: number; week: number } {
  if (isAfterTuesdayNoonEt()) {
    return nextAvailableWeek(DEFAULT_SEASON_TYPE, DEFAULT_WEEK);
  }
  return { seasonType: DEFAULT_SEASON_TYPE, week: DEFAULT_WEEK };
}

export function WeekProvider({ children }: { children: ReactNode }) {
  const initial = fallbackDefaultWeek();
  const [seasonType, setSeasonType] = useState(initial.seasonType);
  const [week, setWeek] = useState(initial.week);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await resolveCurrentPickemsWeek();
        if (!cancelled) {
          const clamped = clampToAvailableWeek(current.seasonType, current.week);
          setSeasonType(clamped.seasonType);
          setWeek(clamped.week);
        }
      } catch {
        if (!cancelled) {
          const fb = fallbackDefaultWeek();
          setSeasonType(fb.seasonType);
          setWeek(fb.week);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<WeekContextValue>(
    () => ({
      seasonType,
      week,
      weekKey: weekStorageKey(seasonType, week),
      label: weekLabel(seasonType, week),
      ready,
      setWeekSelection: (nextSeasonType, nextWeek) => {
        const clamped = clampToAvailableWeek(nextSeasonType, nextWeek);
        setSeasonType(clamped.seasonType);
        setWeek(clamped.week);
      },
    }),
    [seasonType, week, ready],
  );

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek() {
  const ctx = useContext(WeekContext);
  if (!ctx) throw new Error("useWeek must be used within WeekProvider");
  return ctx;
}
