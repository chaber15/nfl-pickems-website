/** Synthetic fixtures shared by node:test files (not imported by app code). */
import type { AtsResult, GameData, PickSide, UserPick } from "./types";

export function makeGame(
  id: string,
  opts: Partial<GameData> & { atsResult?: AtsResult } = {},
): GameData {
  return {
    id,
    espnEventId: id,
    awayTeam: "Away",
    awayAbbrev: "AWY",
    homeTeam: "Home",
    homeAbbrev: "HOM",
    // Sunday 1pm ET — not a primetime slot
    kickoffAt: "2026-09-13T17:00:00.000Z",
    spread: 3,
    favoriteSide: "home",
    oddsAway: -110,
    oddsHome: -110,
    atsResult: "favorite",
    status: "final",
    awayScore: 17,
    homeScore: 24,
    weekNumber: 1,
    seasonType: 2,
    phase: "regular",
    ...opts,
  };
}

export function picksOf(
  entries: Record<string, PickSide | [PickSide, boolean]>,
): Record<string, UserPick> {
  const out: Record<string, UserPick> = {};
  for (const [gameId, v] of Object.entries(entries)) {
    const [pick, isConfidenceBet] = Array.isArray(v) ? v : [v, false];
    out[gameId] = { gameId, pick, isConfidenceBet };
  }
  return out;
}
