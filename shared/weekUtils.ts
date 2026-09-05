import { DEMO_SEASON_TYPE, DEMO_WEEK, type WeekPhase } from "./types";

export interface WeekOption {
  seasonType: number;
  week: number;
  label: string;
  phase: WeekPhase;
}

/** Fan-facing preseason week number (HOF is ESPN 1 → not shown). Kept for labels if needed. */
export function fanPreseasonWeek(espnWeek: number): number {
  return Math.max(1, espnWeek - 1);
}

export function weekStorageKey(seasonType: number, week: number): string {
  const prefix = seasonType === 1 ? "preseason" : seasonType === 3 ? "playoffs" : "regular";
  return `${prefix}-${week}`;
}

export function isDemoSlate(seasonType: number, week: number): boolean {
  return seasonType === DEMO_SEASON_TYPE && week === DEMO_WEEK;
}

export function phaseFor(seasonType: number, week: number): WeekPhase {
  if (seasonType === 1) return "preseason";
  if (seasonType === 3) {
    if (week === 1) return "wildcard";
    if (week === 2) return "divisional";
    if (week === 3) return "conf";
    return "superbowl";
  }
  return "regular";
}

export function buildWeekOptions(): WeekOption[] {
  const options: WeekOption[] = [];
  // Regular season + playoffs only (preseason beta slate removed)
  for (let w = 1; w <= 18; w++) {
    options.push({
      seasonType: 2,
      week: w,
      label: `Week ${w}`,
      phase: "regular",
    });
  }
  const playoff: Array<{ week: number; label: string; phase: WeekPhase }> = [
    { week: 1, label: "Wild Card", phase: "wildcard" },
    { week: 2, label: "Divisional", phase: "divisional" },
    { week: 3, label: "Conference", phase: "conf" },
    { week: 4, label: "Super Bowl", phase: "superbowl" },
  ];
  for (const p of playoff) {
    options.push({ seasonType: 3, week: p.week, label: p.label, phase: p.phase });
  }
  return options;
}

export function weekLabel(seasonType: number, week: number): string {
  return buildWeekOptions().find((o) => o.seasonType === seasonType && o.week === week)?.label
    ?? `Week ${week}`;
}

/** Compact label for the stepper control */
export function shortWeekLabel(seasonType: number, week: number): string {
  if (seasonType === 1) return `Pre ${fanPreseasonWeek(week)}`;
  if (seasonType === 3) {
    if (week === 1) return "Wild Card";
    if (week === 2) return "Divisional";
    if (week === 3) return "Conference";
    return "Super Bowl";
  }
  return `Week ${week}`;
}

export function weekOptionIndex(seasonType: number, week: number): number {
  return buildWeekOptions().findIndex((o) => o.seasonType === seasonType && o.week === week);
}

/** Clamp ESPN calendar into the weeks we still offer. */
export function clampToAvailableWeek(seasonType: number, week: number): { seasonType: number; week: number } {
  // Preseason no longer offered — jump to regular Week 1
  if (seasonType === 1) {
    return { seasonType: 2, week: 1 };
  }
  const idx = weekOptionIndex(seasonType, week);
  if (idx >= 0) return { seasonType, week };
  return { seasonType: DEMO_SEASON_TYPE, week: DEMO_WEEK };
}
