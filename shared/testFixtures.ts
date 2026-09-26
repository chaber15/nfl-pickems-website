/** Synthetic fixtures shared by node:test files (not imported by app code). */
import { computeAtsResult } from "./scoring";
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

/** Deterministic PRNG (mulberry32) so generated seasons are identical on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPREADS = [1, 1.5, 2.5, 3, 3.5, 6, 7, 10, 13.5, 14];
const ODDS = [-110, -105, -115, 100];

/**
 * A realistic synthetic season (regular weeks + 2 playoff weeks) with TNF/SNF/MNF, overtime,
 * pushes, missing lines, skipped picks and mostly-5-★ weeks. Same seed → same season.
 */
export function makeRandomSeason(seed: number, nUsers = 6, nWeeks = 8, nGames = 10) {
  const r = rng(seed);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const users = Array.from({ length: nUsers }, (_, i) => ({ userId: `u${i}`, username: `user${i}` }));
  const slates: Array<{ seasonType: number; weekNumber: number; games: GameData[] }> = [];
  const picksByUser = new Map<string, Record<string, UserPick>>(users.map((u) => [u.userId, {}]));
  const weeks: Array<[number, number]> = [];
  for (let w = 1; w <= nWeeks; w++) weeks.push([2, w]);
  weeks.push([3, 1], [3, 2]);
  const base = Date.parse("2026-09-10T00:00:00Z"); // a Thursday
  const hour = 3600e3;
  weeks.forEach(([seasonType, weekNumber], idx) => {
    const n = seasonType === 3 ? 4 : nGames;
    const weekStart = base + idx * 7 * 24 * hour;
    const games: GameData[] = [];
    for (let i = 0; i < n; i++) {
      // Thu 8:15pm ET, Sun 1pm/4pm, Sun 8:20pm, Mon 8:15pm (ET = UTC−4)
      const kick =
        i === 0
          ? weekStart + 24.25 * hour
          : i === n - 1
            ? weekStart + (4 * 24 + 24.25) * hour
            : i === n - 2
              ? weekStart + (3 * 24 + 24.33) * hour
              : weekStart + (3 * 24 + 17 + (i % 2) * 3) * hour;
      const spread = pick(SPREADS);
      const favoriteSide = r() < 0.6 ? "home" : "away";
      const favScore = Math.floor(r() * 40);
      const dogScore = Math.floor(r() * 35);
      const homeScore = favoriteSide === "home" ? favScore : dogScore;
      const awayScore = favoriteSide === "home" ? dogScore : favScore;
      const ot = r() < 0.15;
      const status = r() < 0.03 && idx === weeks.length - 1 ? "in_progress" : "final";
      const noLine = r() < 0.03;
      const id = `s${seasonType}w${weekNumber}g${i}`;
      games.push(
        makeGame(id, {
          kickoffAt: new Date(kick).toISOString(),
          spread: noLine ? null : spread,
          favoriteSide: noLine ? null : favoriteSide,
          oddsAway: pick(ODDS),
          oddsHome: pick(ODDS),
          atsResult:
            noLine || status !== "final" ? null : computeAtsResult(homeScore, awayScore, spread, favoriteSide),
          status,
          awayScore,
          homeScore,
          weekNumber,
          seasonType,
          phase: seasonType === 3 ? "wildcard" : "regular",
          ...(ot ? { preOtHomeScore: homeScore - pick([0, 3, 7]), preOtAwayScore: awayScore - pick([0, 3, 6]) } : {}),
        }),
      );
    }
    slates.push({ seasonType, weekNumber, games });
    for (const u of users) {
      if (r() < 0.08) continue; // sat the week out
      const m = picksByUser.get(u.userId)!;
      const ids = games.map((g) => g.id).filter(() => r() > 0.07);
      const nStars = r() < 0.8 ? 5 : Math.floor(r() * 7);
      const starSet = new Set([...ids].sort(() => r() - 0.5).slice(0, nStars));
      const bias = r();
      for (const id of ids) {
        m[id] = { gameId: id, pick: r() < bias ? "favorite" : "underdog", isConfidenceBet: starSet.has(id) };
      }
    }
  });
  return { users, slates, picksByUser };
}
