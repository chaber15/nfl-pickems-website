/** Format live game clock / period for the game card badge. */
export function formatLiveClockLabel(game: {
  statusDetail?: string | null;
  period?: number | null;
  displayClock?: string | null;
}): string {
  const detail = (game.statusDetail ?? "").trim();
  if (/halftime/i.test(detail)) return "Halftime";
  if (/^ot$/i.test(detail) || /^overtime$/i.test(detail)) {
    const clock = game.displayClock?.trim();
    return clock ? `OT ${clock}` : "OT";
  }
  if (/end of/i.test(detail)) return detail;

  const period = game.period;
  const clock = game.displayClock?.trim();
  if (period != null && period >= 5) {
    return clock ? `OT ${clock}` : "OT";
  }
  if (period != null && period >= 1 && period <= 4) {
    return clock ? `Q${period} ${clock}` : `Q${period}`;
  }
  if (detail) return detail;
  if (clock) return clock;
  return "LIVE";
}

/** Parse mm:ss clock; return total seconds or null. */
export function parseClockToSeconds(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const m = clock.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatSecondsAsClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

/**
 * Whether the client should tick the clock down between ESPN polls.
 * Freeze on halftime / end of period / OT (OT clocks are unreliable to estimate).
 */
export function shouldTickLiveClock(game: {
  status: string;
  statusDetail?: string | null;
  period?: number | null;
  displayClock?: string | null;
}): boolean {
  if (game.status !== "in_progress") return false;
  const detail = (game.statusDetail ?? "").toLowerCase();
  if (detail.includes("halftime") || detail.includes("end of")) return false;
  if (game.period != null && game.period >= 5) return false;
  if (detail === "ot" || detail.includes("overtime")) return false;
  return parseClockToSeconds(game.displayClock) != null;
}
