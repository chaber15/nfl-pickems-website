import { useEffect, useState } from "react";
import type { GameData } from "@shared/types";
import {
  formatLiveClockLabel,
  formatSecondsAsClock,
  parseClockToSeconds,
  shouldTickLiveClock,
} from "@shared/liveClock";

/** Live clock label that ticks down locally between score refreshes (only while a game is live). */
export function useEstimatedClock(game: GameData): string | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    shouldTickLiveClock(game) ? parseClockToSeconds(game.displayClock) : null,
  );

  useEffect(() => {
    if (!shouldTickLiveClock(game)) {
      setSecondsLeft(null);
      return;
    }
    const initial = parseClockToSeconds(game.displayClock);
    setSecondsLeft(initial);
    if (initial == null) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const left = Math.max(0, initial - elapsed);
      setSecondsLeft(left);
      if (left === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [game.id, game.displayClock, game.period, game.statusDetail, game.status]);

  if (game.status !== "in_progress") return null;
  if (secondsLeft != null && shouldTickLiveClock(game)) {
    return formatLiveClockLabel({
      ...game,
      displayClock: formatSecondsAsClock(secondsLeft),
    });
  }
  return formatLiveClockLabel(game);
}
