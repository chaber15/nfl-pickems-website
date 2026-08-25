import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { detectCurrentWeek } from "@shared/espnClient";
import { DEMO_SEASON_TYPE, DEMO_WEEK } from "@shared/types";
import { clampToAvailableWeek, isDemoSlate, weekLabel, weekStorageKey } from "@shared/weekUtils";
import { isDemoMode } from "./api";

interface WeekContextValue {
  seasonType: number;
  week: number;
  weekKey: string;
  label: string;
  isDemo: boolean;
  ready: boolean;
  setWeekSelection: (seasonType: number, week: number) => void;
}

const WeekContext = createContext<WeekContextValue | null>(null);

export function WeekProvider({ children }: { children: ReactNode }) {
  const demoDefault = isDemoMode();
  const [seasonType, setSeasonType] = useState(DEMO_SEASON_TYPE);
  const [week, setWeek] = useState(DEMO_WEEK);
  const [ready, setReady] = useState(demoDefault);

  useEffect(() => {
    if (demoDefault) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const current = await detectCurrentWeek();
        if (!cancelled) {
          const clamped = clampToAvailableWeek(current.seasonType, current.week);
          setSeasonType(clamped.seasonType);
          setWeek(clamped.week);
        }
      } catch {
        /* keep Pre 3 default */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demoDefault]);

  const value = useMemo<WeekContextValue>(
    () => ({
      seasonType,
      week,
      weekKey: weekStorageKey(seasonType, week),
      label: weekLabel(seasonType, week),
      isDemo: isDemoSlate(seasonType, week) && demoDefault,
      ready,
      setWeekSelection: (nextSeasonType, nextWeek) => {
        const clamped = clampToAvailableWeek(nextSeasonType, nextWeek);
        setSeasonType(clamped.seasonType);
        setWeek(clamped.week);
      },
    }),
    [seasonType, week, ready, demoDefault],
  );

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek() {
  const ctx = useContext(WeekContext);
  if (!ctx) throw new Error("useWeek must be used within WeekProvider");
  return ctx;
}
