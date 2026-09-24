import type { GameData, PickSide, UserPick, WeekComparePlayer } from "./types";
import {
  computeAtsResult,
  computeWinPct,
  isGradedForStandings,
  pickCorrectness,
  weekPlEligible,
} from "./scoring";
import { confidencePlForWeek } from "./statsCompute";

export type BadgeScope = "week" | "season_once";

/** Higher = rarer (1 common → 5 legendary). */
export type BadgeRarity = 1 | 2 | 3 | 4 | 5;

export const BADGE_RARITY_LABEL: Record<BadgeRarity, string> = {
  5: "Legendary",
  4: "Epic",
  3: "Rare",
  2: "Uncommon",
  1: "Common",
};

export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  scope: BadgeScope;
  /** Higher = rarer. Catalog is ordered rarest → common. */
  rarity: BadgeRarity;
};

/**
 * Catalog ordered rarest → most common.
 * Rarity reflects how hard / constrained the award is in a typical league.
 */
export const BADGE_CATALOG: BadgeDef[] = [
  // —— Legendary ——
  {
    id: "ot_hero",
    name: "OT Hero",
    description: "★ bet: losing ATS into OT → winning ATS after OT",
    scope: "week",
    rarity: 5,
  },
  {
    id: "from_the_dead_ats",
    name: "From the Dead",
    description: "Worst → first the next week (ATS)",
    scope: "week",
    rarity: 5,
  },
  {
    id: "from_the_dead_pl",
    name: "From the Dead (★)",
    description: "Worst → first the next week (★ P/L)",
    scope: "week",
    rarity: 5,
  },
  {
    id: "money_printer",
    name: "Money Printer",
    description: "5 straight eligible ★ weeks >50%",
    scope: "week",
    rarity: 5,
  },
  {
    id: "tide_rider",
    name: "Tide Rider",
    description: "5 straight weeks ATS >50%",
    scope: "week",
    rarity: 5,
  },
  {
    id: "primetime",
    name: "Primetime",
    description: "Correctly pick and ★ TNF, SNF, and MNF in the same week",
    scope: "week",
    rarity: 5,
  },
  {
    id: "clean_sweep",
    name: "Clean Sweep",
    description: "All graded picks correct that week",
    scope: "week",
    rarity: 5,
  },

  // —— Epic ——
  {
    id: "kennel_club",
    name: "Kennel Club",
    description: "More than half your picks were underdogs, and all those dogs hit",
    scope: "week",
    rarity: 4,
  },
  {
    id: "giant_killer",
    name: "Giant Killer",
    description: "★ dog cover where >67% of the field was on the other side",
    scope: "week",
    rarity: 4,
  },
  {
    id: "five_star_general",
    name: "Five-Star General",
    description: "All 5 ★ bets correct",
    scope: "week",
    rarity: 4,
  },
  {
    id: "monday_miracle",
    name: "Monday Miracle",
    description: "Correct MNF pick that flips your week to a win (>50%)",
    scope: "week",
    rarity: 4,
  },
  {
    id: "howl",
    name: "Howl",
    description: "First Lone Wolf of the season",
    scope: "season_once",
    rarity: 4,
  },
  {
    id: "lone_wolf",
    name: "Lone Wolf",
    description: "Only person on that side, and it hit",
    scope: "week",
    rarity: 4,
  },
  {
    id: "fall_from_grace_ats",
    name: "Fall From Grace",
    description: "First → last the next week (ATS)",
    scope: "week",
    rarity: 4,
  },
  {
    id: "fall_from_grace_pl",
    name: "Fall From Grace (★)",
    description: "First → last the next week (★ P/L)",
    scope: "week",
    rarity: 4,
  },

  // —— Rare ——
  {
    id: "golden_run",
    name: "Golden Run",
    description: "3 straight eligible ★ weeks >50%",
    scope: "week",
    rarity: 3,
  },
  {
    id: "dog_day_afternoon",
    name: "Dog Days",
    description: "Every pick that week was an underdog",
    scope: "week",
    rarity: 3,
  },
  {
    id: "underdog_cartel",
    name: "Underdog Cartel",
    description: "All 5 ★ bets were underdogs",
    scope: "week",
    rarity: 3,
  },
  {
    id: "total_wipeout",
    name: "Total Wipeout",
    description: "All graded picks wrong",
    scope: "week",
    rarity: 3,
  },
  {
    id: "busted_five",
    name: "Busted Five",
    description: "All 5 ★ bets wrong",
    scope: "week",
    rarity: 3,
  },
  {
    id: "bite_back",
    name: "Bite Back",
    description: "Need 3 career ★ underdogs that win outright (not once)",
    scope: "season_once",
    rarity: 3,
  },
  {
    id: "hot_hand",
    name: "Hot Hand",
    description: "3 straight weeks ATS >50%",
    scope: "week",
    rarity: 3,
  },
  {
    id: "contrarian",
    name: "Contrarian",
    description: "More than half your picks against the crowd, and more than half of those hit",
    scope: "week",
    rarity: 3,
  },
  {
    id: "high_roller",
    name: "High Roller",
    description: "First time #1 overall win %",
    scope: "season_once",
    rarity: 3,
  },
  {
    id: "throne_room",
    name: "Throne Room",
    description: "First time #1 overall confidence P/L",
    scope: "season_once",
    rarity: 3,
  },

  // —— Uncommon ——
  {
    id: "by_a_nose",
    name: "By a Nose",
    description: "Need 3 career ★ covers by ≤1.5 points (not once)",
    scope: "season_once",
    rarity: 2,
  },
  {
    id: "juice_box",
    name: "Juice Box",
    description: "Need 5 career ★ wins as a home underdog (not once)",
    scope: "season_once",
    rarity: 2,
  },
  {
    id: "road_dog",
    name: "Road Dog",
    description: "Need 5 career ★ wins as an away underdog (not once)",
    scope: "season_once",
    rarity: 2,
  },
  {
    id: "steamroller",
    name: "Steamroller",
    description: "Need 3 career ★ favorites that cover by 14+ (not once)",
    scope: "season_once",
    rarity: 2,
  },
  {
    id: "week_champion",
    name: "Week Champion",
    description: "First weekly win-% board win",
    scope: "season_once",
    rarity: 2,
  },
  {
    id: "bankroll_king",
    name: "Bankroll King",
    description: "First weekly confidence P/L win",
    scope: "season_once",
    rarity: 2,
  },
  {
    id: "chalk_city",
    name: "Chalk City",
    description: "Every pick that week was a favorite",
    scope: "week",
    rarity: 2,
  },
  {
    id: "chalk_cartel",
    name: "Chalk Cartel",
    description: "All 5 ★ bets were favorites",
    scope: "week",
    rarity: 2,
  },
  {
    id: "split_decision",
    name: "Split Decision",
    description: "Exactly 50% on the week",
    scope: "week",
    rarity: 2,
  },

  // —— Common ——
  {
    id: "no_show",
    name: "No Show",
    description: "First time you miss ≥1 game while picking others that week",
    scope: "season_once",
    rarity: 1,
  },
  {
    id: "unstarred",
    name: "Unstarred",
    description: "Picks in but not exactly 5 ★ (ineligible P/L week)",
    scope: "week",
    rarity: 1,
  },
];

const BY_ID = new Map(BADGE_CATALOG.map((b) => [b.id, b]));

export function badgeName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

export function badgeDescription(id: string): string {
  return BY_ID.get(id)?.description ?? "";
}

export function badgeRarity(id: string): BadgeRarity {
  return BY_ID.get(id)?.rarity ?? 1;
}

/** Sort badge ids rarest first (stable for ties). */
export function compareBadgeRarity(aId: string, bId: string): number {
  const dr = badgeRarity(bId) - badgeRarity(aId);
  if (dr !== 0) return dr;
  return badgeName(aId).localeCompare(badgeName(bId));
}

/** Chip fill by rarity (5 = legendary → 1 = common). */
const BADGE_CHIP_BY_RARITY: Record<BadgeRarity, string> = {
  5: "border-[#a16207] bg-[#eab308] text-[#1a1408]",
  4: "border-[#6d28d9] bg-[#8b5cf6] text-[#1e0a3c]",
  3: "border-[#1d4ed8] bg-[#3b82f6] text-[#eff6ff]",
  2: "border-[#c2410c] bg-[#fb923c] text-[#1c0a02]",
  1: "border-[#475569] bg-[#94a3b8] text-[#0f172a]",
};

const BADGE_SOFT_BY_RARITY: Record<BadgeRarity, string> = {
  5: "border-[#eab308]/50 bg-[#eab308]/15",
  4: "border-[#8b5cf6]/50 bg-[#8b5cf6]/15",
  3: "border-[#3b82f6]/50 bg-[#3b82f6]/15",
  2: "border-[#fb923c]/50 bg-[#fb923c]/15",
  1: "border-[#94a3b8]/50 bg-[#94a3b8]/15",
};

export function badgeChipClass(id: string): string {
  return BADGE_CHIP_BY_RARITY[badgeRarity(id)];
}

export function badgeSoftClass(id: string): string {
  return BADGE_SOFT_BY_RARITY[badgeRarity(id)];
}

/**
 * Sentinel `weekNumber` for season_once awards.
 * Must be non-null so Postgres UNIQUE indexes actually enforce one row
 * (NULL ≠ NULL in UNIQUE constraints).
 */
export const SEASON_BADGE_WEEK = 0;

export function isSeasonScopedBadge(weekNumber: number | null | undefined): boolean {
  return weekNumber == null || weekNumber === SEASON_BADGE_WEEK;
}

export type BadgeAward = {
  badgeId: string;
  seasonType: number | null;
  weekNumber: number | null;
};

export type PrimetimeSlot = "tnf" | "snf" | "mnf" | null;

/** Classify TNF / SNF / MNF from kickoff (US Eastern). */
let easternFmt: Intl.DateTimeFormat | null = null;

export function primetimeSlot(kickoffAt: string): PrimetimeSlot {
  const d = new Date(kickoffAt);
  easternFmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = easternFmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (weekday === "Thu" && hour >= 19) return "tnf";
  if (weekday === "Mon" && hour >= 19) return "mnf";
  if (weekday === "Sun" && hour >= 19) return "snf";
  return null;
}

function coverMargin(
  homeScore: number,
  awayScore: number,
  spread: number,
  favoriteSide: "home" | "away",
  pick: PickSide,
): number | null {
  const favScore = favoriteSide === "home" ? homeScore : awayScore;
  const dogScore = favoriteSide === "home" ? awayScore : homeScore;
  const favMargin = favScore - dogScore - Math.abs(spread);
  if (pick === "favorite") return favMargin;
  return -favMargin;
}

/**
 * Career thresholds for cumulative ★-bet badges (not per-week).
 * Adding an id here is the only edit needed: the catalog description, the week
 * evaluator, the reconcile wipe, and the admin copy all read from this map.
 */
export const LIFETIME_BADGE_THRESHOLDS = {
  by_a_nose: 3,
  juice_box: 5,
  road_dog: 5,
  steamroller: 3,
  bite_back: 3,
} as const;

export type LifetimeThresholdBadgeId = keyof typeof LIFETIME_BADGE_THRESHOLDS;

export const LIFETIME_THRESHOLD_BADGE_IDS = Object.keys(
  LIFETIME_BADGE_THRESHOLDS,
) as LifetimeThresholdBadgeId[];

export function isLifetimeThresholdBadge(id: string): id is LifetimeThresholdBadgeId {
  return Object.hasOwn(LIFETIME_BADGE_THRESHOLDS, id);
}

/**
 * Cumulative badges must be season-scoped (week 0 exactly).
 * Legacy once-per-week rows (week > 0) and null weeks must never display.
 */
export function isDisplayableBadgeAward(
  badgeId: string,
  weekNumber: number | null | undefined,
): boolean {
  if (!isLifetimeThresholdBadge(badgeId)) return true;
  return weekNumber === SEASON_BADGE_WEEK;
}

export type LifetimeBadgeCounts = Record<LifetimeThresholdBadgeId, number>;

export function emptyLifetimeBadgeCounts(): LifetimeBadgeCounts {
  const counts = {} as LifetimeBadgeCounts;
  for (const id of LIFETIME_THRESHOLD_BADGE_IDS) counts[id] = 0;
  return counts;
}

/** Awards for every cumulative badge whose career threshold is met. */
export function lifetimeBadgeAwards(
  counts: LifetimeBadgeCounts,
  seasonType: number,
): BadgeAward[] {
  return LIFETIME_THRESHOLD_BADGE_IDS.filter(
    (id) => counts[id] >= LIFETIME_BADGE_THRESHOLDS[id],
  ).map((id) => ({ badgeId: id, seasonType, weekNumber: SEASON_BADGE_WEEK }));
}

/** Count ★ events that feed lifetime badges for one week of games. */
export function countLifetimeBadgeEvents(
  games: GameData[],
  picks: Record<string, UserPick>,
): LifetimeBadgeCounts {
  const counts = emptyLifetimeBadgeCounts();

  for (const g of games) {
    if (!isGradedForStandings(g)) continue;
    const up = picks[g.id];
    if (!up?.pick || !up.isConfidenceBet) continue;
    if (!g.favoriteSide || g.spread == null || g.awayScore == null || g.homeScore == null || !g.atsResult) {
      continue;
    }

    const margin = coverMargin(g.homeScore, g.awayScore, g.spread, g.favoriteSide, up.pick);
    if (margin != null && margin > 0 && margin <= 1.5) counts.by_a_nose++;

    if (up.pick === "underdog") {
      const dogIsHome = g.favoriteSide === "away";
      if (pickCorrectness(up.pick, g.atsResult) === 1) {
        if (dogIsHome) counts.juice_box++;
        else counts.road_dog++;

        const dogScore = dogIsHome ? g.homeScore : g.awayScore;
        const favScore = dogIsHome ? g.awayScore : g.homeScore;
        if (dogScore > favScore) counts.bite_back++;
      }
    }

    if (up.pick === "favorite" && margin != null && margin >= 14) {
      counts.steamroller++;
    }
  }

  return counts;
}

function crowdSplit(
  game: GameData,
  players: WeekComparePlayer[],
): { away: number; home: number; fav: number; dog: number } {
  let away = 0;
  let home = 0;
  for (const p of players) {
    const entry = p.picks[game.id];
    if (!entry || !game.favoriteSide) continue;
    const venue = entry.pick === "favorite" ? game.favoriteSide : game.favoriteSide === "home" ? "away" : "home";
    if (venue === "away") away++;
    else home++;
  }
  const fav = game.favoriteSide === "home" ? home : away;
  const dog = game.favoriteSide === "home" ? away : home;
  return { away, home, fav, dog };
}

export type WeekPlayerContext = {
  userId: string;
  username: string;
  picks: Record<string, UserPick>;
};

/**
 * Tie-aware standing of one player on a weekly board.
 * `first`: nobody scored strictly higher (co-leaders are all first).
 * `last`: nobody scored strictly lower AND somebody scored higher (an all-way tie has no "last").
 */
export type BoardStanding = { first: boolean; last: boolean };

export const NO_STANDING: BoardStanding = { first: false, last: false };

/**
 * Evaluate badges for one user for a completed week.
 * Standings are tie-aware (see `BoardStanding`); `prior*` refer to the previous week of the
 * same season type (NO_STANDING when the player wasn't ranked then, or there is no prior week).
 * `atsStreak` / `confStreak` are current week-ending streaks including this week.
 * season_once badges (howl, no_show, week_champion, bankroll_king) are emitted every time the
 * condition holds; the caller keeps only the first (see `computeDesiredBadges`).
 */
export function evaluateWeekBadges(args: {
  games: GameData[];
  seasonType: number;
  weekNumber: number;
  player: WeekPlayerContext;
  allPlayers: WeekComparePlayer[];
  atsStreak: number;
  confStreak: number;
  ats: BoardStanding;
  pl: BoardStanding;
  priorAts: BoardStanding;
  priorPl: BoardStanding;
}): BadgeAward[] {
  const {
    games,
    seasonType,
    weekNumber,
    player,
    allPlayers,
    atsStreak,
    confStreak,
    ats,
    pl,
    priorAts,
    priorPl,
  } = args;

  const awards: BadgeAward[] = [];
  const week = (id: string) => awards.push({ badgeId: id, seasonType, weekNumber });
  const season = (id: string) =>
    awards.push({ badgeId: id, seasonType, weekNumber: SEASON_BADGE_WEEK });

  const graded = games.filter((g) => isGradedForStandings(g));
  if (graded.length === 0) return awards;

  const picks = player.picks;
  const pickedGames = graded.filter((g) => picks[g.id]?.pick);
  const missed = graded.filter((g) => !picks[g.id]?.pick);
  const confPicks = graded.filter((g) => picks[g.id]?.pick && picks[g.id]?.isConfidenceBet);

  let correctSum = 0;
  for (const g of graded) {
    correctSum += pickCorrectness(picks[g.id]?.pick ?? null, g.atsResult);
  }
  const winPct = computeWinPct(correctSum, graded.length);

  // Perfect / wipeout
  if (pickedGames.length === graded.length && graded.every((g) => pickCorrectness(picks[g.id]!.pick, g.atsResult) === 1)) {
    week("clean_sweep");
  }
  // Needs at least one pick: a player who sat the week out didn't "wipe out".
  if (
    pickedGames.length > 0 &&
    graded.every((g) => pickCorrectness(picks[g.id]?.pick ?? null, g.atsResult) === 0)
  ) {
    week("total_wipeout");
  }
  if (confPicks.length === 5 && confPicks.every((g) => pickCorrectness(picks[g.id]!.pick, g.atsResult) === 1)) {
    week("five_star_general");
  }
  if (confPicks.length === 5 && confPicks.every((g) => pickCorrectness(picks[g.id]!.pick, g.atsResult) === 0)) {
    week("busted_five");
  }

  if (pickedGames.length > 0 && pickedGames.every((g) => picks[g.id]!.pick === "underdog")) {
    week("dog_day_afternoon");
  }
  if (pickedGames.length > 0 && pickedGames.every((g) => picks[g.id]!.pick === "favorite")) {
    week("chalk_city");
  }
  if (confPicks.length === 5 && confPicks.every((g) => picks[g.id]!.pick === "underdog")) {
    week("underdog_cartel");
  }
  if (confPicks.length === 5 && confPicks.every((g) => picks[g.id]!.pick === "favorite")) {
    week("chalk_cartel");
  }

  // Lone Wolf
  let earnedLoneWolf = false;
  for (const g of graded) {
    const up = picks[g.id];
    if (!up?.pick || g.atsResult == null || g.atsResult === "push") continue;
    if (up.pick !== g.atsResult) continue;
    const split = crowdSplit(g, allPlayers);
    const onSide = up.pick === "favorite" ? split.fav : split.dog;
    if (onSide === 1) {
      earnedLoneWolf = true;
      break;
    }
  }
  if (earnedLoneWolf) {
    week("lone_wolf");
    season("howl");
  }

  if (atsStreak >= 5) week("tide_rider");
  else if (atsStreak >= 3) week("hot_hand");
  if (confStreak >= 5) week("money_printer");
  else if (confStreak >= 3) week("golden_run");

  // Primetime: ★ + correct on TNF, SNF, MNF
  const bySlot = { tnf: null as GameData | null, snf: null as GameData | null, mnf: null as GameData | null };
  for (const g of graded) {
    const slot = primetimeSlot(g.kickoffAt);
    if (slot) bySlot[slot] = g;
  }
  if (bySlot.tnf && bySlot.snf && bySlot.mnf) {
    const ok = ([bySlot.tnf, bySlot.snf, bySlot.mnf] as GameData[]).every((g) => {
      const up = picks[g.id];
      return up?.pick && up.isConfidenceBet && pickCorrectness(up.pick, g.atsResult) === 1;
    });
    if (ok) week("primetime");
  }

  if (ats.first) season("week_champion");
  if (pl.first) season("bankroll_king");

  // Monday Miracle: without MNF result would be ≤50%, with it >50%
  const mnf = bySlot.mnf;
  if (mnf) {
    const up = picks[mnf.id];
    if (up?.pick && pickCorrectness(up.pick, mnf.atsResult) === 1) {
      let without = 0;
      let withoutTotal = 0;
      for (const g of graded) {
        if (g.id === mnf.id) continue;
        withoutTotal++;
        without += pickCorrectness(picks[g.id]?.pick ?? null, g.atsResult);
      }
      const pctWithout = withoutTotal > 0 ? computeWinPct(without, withoutTotal) : 0;
      if (pctWithout <= 50 && winPct > 50) week("monday_miracle");
    }
  }

  for (const g of confPicks) {
    const up = picks[g.id]!;
    if (!g.favoriteSide || g.spread == null || g.awayScore == null || g.homeScore == null || !g.atsResult) continue;

    if (up.pick === "underdog") {
      const split = crowdSplit(g, allPlayers);
      const totalCrowd = split.fav + split.dog;
      if (
        totalCrowd > 0 &&
        split.fav / totalCrowd > 0.67 &&
        pickCorrectness(up.pick, g.atsResult) === 1
      ) {
        week("giant_killer");
      }
    }

    // OT Hero
    if (
      g.preOtAwayScore != null &&
      g.preOtHomeScore != null &&
      pickCorrectness(up.pick, g.atsResult) === 1
    ) {
      const preAts = computeAtsResult(g.preOtHomeScore, g.preOtAwayScore, g.spread, g.favoriteSide);
      if (preAts && preAts !== "push" && up.pick !== preAts) {
        week("ot_hero");
      }
    }
  }

  // Kennel Club
  const dogPicks = pickedGames.filter((g) => picks[g.id]!.pick === "underdog");
  if (
    pickedGames.length > 0 &&
    dogPicks.length > pickedGames.length / 2 &&
    dogPicks.every((g) => pickCorrectness(picks[g.id]!.pick, g.atsResult) === 1)
  ) {
    week("kennel_club");
  }

  // Contrarian
  let against = 0;
  let againstHits = 0;
  for (const g of pickedGames) {
    const up = picks[g.id]!;
    const split = crowdSplit(g, allPlayers);
    const total = split.fav + split.dog;
    if (total === 0) continue;
    const majority: PickSide = split.fav >= split.dog ? "favorite" : "underdog";
    if (up.pick !== majority) {
      against++;
      if (pickCorrectness(up.pick, g.atsResult) === 1) againstHits++;
    }
  }
  if (pickedGames.length > 0 && against > pickedGames.length / 2 && againstHits > against / 2) {
    week("contrarian");
  }

  if (winPct === 50 && graded.length > 0) week("split_decision");

  // From the Dead / Fall From Grace (tie-aware: co-leaders / co-last all count)
  if (priorAts.last && ats.first) week("from_the_dead_ats");
  if (priorAts.first && ats.last) week("fall_from_grace_ats");
  if (priorPl.last && pl.first) week("from_the_dead_pl");
  if (priorPl.first && pl.last) week("fall_from_grace_pl");

  if (missed.length > 0 && pickedGames.length > 0) {
    season("no_show");
  }

  const phase = games[0]?.phase ?? "regular";
  const confCount = Object.values(picks).filter((p) => p.isConfidenceBet).length;
  if (pickedGames.length > 0 && !weekPlEligible(phase, confCount)) {
    week("unstarred");
  }

  // Deduplicate same badge id for the week
  const seen = new Set<string>();
  return awards.filter((a) => {
    const key = `${a.badgeId}:${a.seasonType}:${a.weekNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function weekAtsRecord(
  games: GameData[],
  picks: Record<string, UserPick>,
): { correct: number; total: number; winPct: number } {
  let correct = 0;
  let total = 0;
  for (const g of games) {
    if (!isGradedForStandings(g)) continue;
    total++;
    correct += pickCorrectness(picks[g.id]?.pick ?? null, g.atsResult);
  }
  return { correct, total, winPct: computeWinPct(correct, total) };
}

export function weekConfWinPct(
  games: GameData[],
  picks: Record<string, UserPick>,
): number {
  const { eligible } = confidencePlForWeek(games, picks);
  if (!eligible) return 0;
  let correct = 0;
  let total = 0;
  for (const g of games) {
    if (!isGradedForStandings(g)) continue;
    const up = picks[g.id];
    if (!up?.pick || !up.isConfidenceBet) continue;
    total++;
    correct += pickCorrectness(up.pick, g.atsResult);
  }
  return computeWinPct(correct, total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Season badge engine (pure): desired rows for a whole season + diff vs. DB rows
// ─────────────────────────────────────────────────────────────────────────────

/** Scores closer than this are treated as tied (float sums of juice-based units). */
const SCORE_EPS = 1e-9;

/**
 * Tie-aware standings for one board. Everyone sharing the top score is `first`;
 * everyone sharing the bottom score is `last` unless the whole board is tied.
 */
export function tieStandings(
  entries: Array<{ userId: string; score: number }>,
): Map<string, BoardStanding> {
  const out = new Map<string, BoardStanding>();
  if (entries.length === 0) return out;
  let max = -Infinity;
  let min = Infinity;
  for (const e of entries) {
    if (e.score > max) max = e.score;
    if (e.score < min) min = e.score;
  }
  const allTied = max - min <= SCORE_EPS;
  for (const e of entries) {
    out.set(e.userId, {
      first: max - e.score <= SCORE_EPS,
      last: !allTied && e.score - min <= SCORE_EPS,
    });
  }
  return out;
}

/** A week's full slate (every game in the week, graded or not). */
export type SeasonSlate = { seasonType: number; weekNumber: number; games: GameData[] };

export type BadgeEngineUser = { userId: string; username: string; displayName?: string | null };

/** One badge row the engine wants to exist. season_once rows use weekNumber 0. */
export type DesiredBadgeRow = {
  userId: string;
  badgeId: string;
  seasonType: number;
  weekNumber: number;
  /** Week whose final results produced this row (for per-week reporting). */
  source: { seasonType: number; weekNumber: number };
};

/** Week-scoped badges need the whole slate final and at least one graded game. */
/** Games still "scheduled" this long after kickoff (canceled / never rescheduled) don't block a week. */
const ABANDONED_GAME_MS = 3 * 24 * 60 * 60 * 1000;

export function isSlateComplete(games: GameData[], now = new Date()): boolean {
  const settled = (g: GameData) =>
    g.status === "final" ||
    (g.status === "scheduled" && now.getTime() - new Date(g.kickoffAt).getTime() > ABANDONED_GAME_MS);
  return (
    games.length > 0 &&
    games.every(settled) &&
    games.some((g) => isGradedForStandings(g))
  );
}

export function compareSlates(
  a: { seasonType: number; weekNumber: number },
  b: { seasonType: number; weekNumber: number },
): number {
  return a.seasonType - b.seasonType || a.weekNumber - b.weekNumber;
}

/**
 * Identity of a badge row. season_once rows (week 0) are unique per user+badge
 * (matches the `user_badges_season_once_idx` partial unique index), so their
 * seasonType is not part of the key.
 */
export function badgeRowKey(r: {
  userId: string;
  badgeId: string;
  seasonType: number | null;
  weekNumber: number | null;
}): string {
  const wk = r.weekNumber ?? SEASON_BADGE_WEEK;
  if (wk === SEASON_BADGE_WEEK) return `${r.userId}|${r.badgeId}|0`;
  return `${r.userId}|${r.badgeId}|${r.seasonType ?? "null"}|${wk}`;
}

function streakEndingAt(pctsOldestFirst: number[]): number {
  let streak = 0;
  for (let i = pctsOldestFirst.length - 1; i >= 0; i--) {
    if (pctsOldestFirst[i]! > 50) streak++;
    else break;
  }
  return streak;
}

/**
 * Compute every badge row the active season's final results justify.
 *
 * Rules (kept from the original per-week evaluator unless marked [fix]):
 * - Only complete slates (every game final, ≥1 graded) are evaluated, oldest → newest
 *   by (seasonType, week), so regular season precedes playoffs.
 * - Weekly boards rank only *participants* (≥1 pick on a graded game that week). The ★ P/L
 *   board ranks only P/L-eligible participants (eligible week with ≥1 ★ bet). [fix: players
 *   with no picks, and ineligible weeks' 0.00 P/L, no longer occupy first/last]
 * - Ties for first make co-champions: week_champion (top win %) and bankroll_king (top ★ P/L)
 *   go to everyone sharing the top score. [fix: was whoever happened to sort first]
 * - From the Dead / Fall From Grace use the same tie-aware standings vs. the previous week of
 *   the same season type.
 * - Streaks (hot_hand/tide_rider, golden_run/money_printer) reset when the season type changes;
 *   ★ streaks skip ineligible weeks (unchanged).
 * - high_roller / throne_room ("first time #1 overall"): after each completed week, the overall
 *   standings through that week (same metrics as the overall leaderboard: win % over all graded
 *   games; ★ P/L over eligible weeks) are checked and every co-leader earns it. Only completed
 *   weeks count, so a mid-week (transient) leader is never awarded. Overall standings span the
 *   whole season (regular + playoffs) like the leaderboard.
 * - season_once rows keep the first week that earned them; lifetime-threshold rows are stamped
 *   with the last completed slate's season type.
 * - Games where `isGradedForStandings` is false never count (every helper checks it).
 */
export function computeDesiredBadges(input: {
  users: BadgeEngineUser[];
  slates: SeasonSlate[];
  /** userId → public game id → pick, across the season. */
  picksByUser: Map<string, Record<string, UserPick>>;
}): { rows: DesiredBadgeRow[]; completedWeeks: Array<{ seasonType: number; weekNumber: number }> } {
  const { users } = input;
  const completed = input.slates.filter((s) => isSlateComplete(s.games)).sort(compareSlates);

  const desired = new Map<string, DesiredBadgeRow>();
  const add = (row: DesiredBadgeRow) => {
    const key = badgeRowKey(row);
    if (!desired.has(key)) desired.set(key, row);
  };

  const streaks = new Map<string, { ats: number[]; conf: number[] }>();
  const lifetime = new Map<string, LifetimeBadgeCounts>();
  const cumulative = new Map<
    string,
    { correct: number; total: number; pl: number; plWeeks: number; picked: boolean }
  >();
  for (const u of users) {
    streaks.set(u.userId, { ats: [], conf: [] });
    lifetime.set(u.userId, emptyLifetimeBadgeCounts());
    cumulative.set(u.userId, { correct: 0, total: 0, pl: 0, plWeeks: 0, picked: false });
  }

  let prior: {
    seasonType: number;
    weekNumber: number;
    ats: Map<string, BoardStanding>;
    pl: Map<string, BoardStanding>;
  } | null = null;
  let lastSeasonType: number | null = null;

  for (const slate of completed) {
    const { seasonType, weekNumber, games } = slate;
    const source = { seasonType, weekNumber };
    const gameIds = new Set(games.map((g) => g.id));
    const graded = games.filter((g) => isGradedForStandings(g));

    if (lastSeasonType !== seasonType) {
      for (const s of streaks.values()) {
        s.ats = [];
        s.conf = [];
      }
      lastSeasonType = seasonType;
    }

    const weekPicks = new Map<string, Record<string, UserPick>>();
    const players: WeekComparePlayer[] = [];
    const stats = new Map<
      string,
      {
        correct: number;
        total: number;
        winPct: number;
        pl: number;
        eligible: boolean;
        plEligible: boolean;
        participant: boolean;
      }
    >();
    for (const u of users) {
      const all = input.picksByUser.get(u.userId) ?? {};
      const picks: Record<string, UserPick> = {};
      const comparePicks: WeekComparePlayer["picks"] = {};
      for (const [gid, p] of Object.entries(all)) {
        if (!gameIds.has(gid)) continue;
        picks[gid] = p;
        if (p.pick) comparePicks[gid] = { pick: p.pick, isConfidenceBet: p.isConfidenceBet };
      }
      weekPicks.set(u.userId, picks);
      players.push({
        userId: u.userId,
        username: u.username,
        displayName: u.displayName ?? u.username,
        picks: comparePicks,
      });
      const rec = weekAtsRecord(games, picks);
      const conf = confidencePlForWeek(games, picks);
      stats.set(u.userId, {
        ...rec,
        pl: conf.pl,
        eligible: conf.eligible,
        plEligible: conf.eligible && conf.confCount > 0,
        participant: graded.some((g) => picks[g.id]?.pick),
      });
    }

    const atsBoard = tieStandings(
      users
        .filter((u) => stats.get(u.userId)!.participant)
        .map((u) => ({ userId: u.userId, score: stats.get(u.userId)!.winPct })),
    );
    const plBoard = tieStandings(
      users
        .filter((u) => stats.get(u.userId)!.participant && stats.get(u.userId)!.plEligible)
        .map((u) => ({ userId: u.userId, score: stats.get(u.userId)!.pl })),
    );
    const priorBoards =
      prior != null && prior.seasonType === seasonType && prior.weekNumber === weekNumber - 1
        ? prior
        : null;

    for (const u of users) {
      const st = stats.get(u.userId)!;
      const picks = weekPicks.get(u.userId)!;
      const streak = streaks.get(u.userId)!;
      if (st.total > 0) streak.ats.push(st.winPct);
      if (st.eligible) streak.conf.push(weekConfWinPct(games, picks));

      const awards = evaluateWeekBadges({
        games,
        seasonType,
        weekNumber,
        player: { userId: u.userId, username: u.username, picks },
        allPlayers: players,
        atsStreak: streakEndingAt(streak.ats),
        confStreak: streakEndingAt(streak.conf),
        ats: atsBoard.get(u.userId) ?? NO_STANDING,
        pl: plBoard.get(u.userId) ?? NO_STANDING,
        priorAts: priorBoards?.ats.get(u.userId) ?? NO_STANDING,
        priorPl: priorBoards?.pl.get(u.userId) ?? NO_STANDING,
      });
      for (const a of awards) {
        add({
          userId: u.userId,
          badgeId: a.badgeId,
          seasonType: a.seasonType ?? seasonType,
          weekNumber: a.weekNumber ?? SEASON_BADGE_WEEK,
          source,
        });
      }

      const ev = countLifetimeBadgeEvents(games, picks);
      const counts = lifetime.get(u.userId)!;
      for (const id of LIFETIME_THRESHOLD_BADGE_IDS) counts[id] += ev[id];

      const cum = cumulative.get(u.userId)!;
      cum.correct += st.correct;
      cum.total += st.total;
      if (st.plEligible) {
        cum.pl += st.pl;
        cum.plWeeks++;
      }
      if (st.participant) cum.picked = true;
    }

    // Overall leaders through this completed week → High Roller / Throne Room (co-leaders too)
    const overallWin = tieStandings(
      users
        .filter((u) => cumulative.get(u.userId)!.picked && cumulative.get(u.userId)!.total > 0)
        .map((u) => {
          const c = cumulative.get(u.userId)!;
          return { userId: u.userId, score: computeWinPct(c.correct, c.total) };
        }),
    );
    const overallPl = tieStandings(
      users
        .filter((u) => cumulative.get(u.userId)!.plWeeks > 0)
        .map((u) => ({ userId: u.userId, score: cumulative.get(u.userId)!.pl })),
    );
    for (const [userId, s] of overallWin) {
      if (s.first) {
        add({ userId, badgeId: "high_roller", seasonType, weekNumber: SEASON_BADGE_WEEK, source });
      }
    }
    for (const [userId, s] of overallPl) {
      if (s.first) {
        add({ userId, badgeId: "throne_room", seasonType, weekNumber: SEASON_BADGE_WEEK, source });
      }
    }

    prior = { seasonType, weekNumber, ats: atsBoard, pl: plBoard };
  }

  const last = completed[completed.length - 1];
  if (last) {
    const source = { seasonType: last.seasonType, weekNumber: last.weekNumber };
    for (const u of users) {
      for (const a of lifetimeBadgeAwards(lifetime.get(u.userId)!, last.seasonType)) {
        add({
          userId: u.userId,
          badgeId: a.badgeId,
          seasonType: last.seasonType,
          weekNumber: SEASON_BADGE_WEEK,
          source,
        });
      }
    }
  }

  return {
    rows: [...desired.values()],
    completedWeeks: completed.map((s) => ({ seasonType: s.seasonType, weekNumber: s.weekNumber })),
  };
}

/** Badge ids whose season_once (week 0) rows are fully recomputed by `computeDesiredBadges`. */
export const ENGINE_SEASON_BADGE_IDS: ReadonlySet<string> = new Set([
  "howl",
  "no_show",
  "week_champion",
  "bankroll_king",
  "high_roller",
  "throne_room",
  ...LIFETIME_THRESHOLD_BADGE_IDS,
]);

export type ExistingBadgeRow = {
  id: string;
  userId: string;
  badgeId: string;
  seasonType: number | null;
  weekNumber: number;
  earnedAt: Date;
};

/**
 * What the diff may delete. `user_badges` has no season column, so ownership is inferred:
 * - only rows of `userIds` (active, non-banned users — banned users' rows are left alone);
 * - only rows earned at/after `seasonStartedAt` (the active season row's createdAt); anything
 *   older must come from an earlier season and is never deleted;
 * - week rows (week > 0) only when their (seasonType, week) is a week of the active season;
 * - season_once rows (week 0) only for badge ids the engine recomputes (ENGINE_SEASON_BADGE_IDS);
 * - legacy lifetime-threshold rows stored with week > 0 are always stale (never displayable).
 * Out-of-scope rows still satisfy a desired row with the same key (never duplicated) but are
 * never deleted.
 */
export type BadgeDiffScope = {
  userIds: ReadonlySet<string>;
  /** `${seasonType}-${weekNumber}` for every week of the active season. */
  weekKeys: ReadonlySet<string>;
  seasonStartedAt: Date | null;
  /** Restrict the whole diff (inserts and deletes) to these badge ids, e.g. lifetime reconcile. */
  onlyBadgeIds?: ReadonlySet<string>;
};

export function isRowInDiffScope(row: ExistingBadgeRow, scope: BadgeDiffScope): boolean {
  if (!scope.userIds.has(row.userId)) return false;
  if (scope.onlyBadgeIds && !scope.onlyBadgeIds.has(row.badgeId)) return false;
  if (scope.seasonStartedAt && row.earnedAt.getTime() < scope.seasonStartedAt.getTime()) {
    return false;
  }
  if (row.weekNumber === SEASON_BADGE_WEEK) return ENGINE_SEASON_BADGE_IDS.has(row.badgeId);
  if (isLifetimeThresholdBadge(row.badgeId)) return true;
  return scope.weekKeys.has(`${row.seasonType}-${row.weekNumber}`);
}

/**
 * Diff desired rows against existing rows. Matching existing rows are kept untouched
 * (earnedAt preserved); missing rows are inserted; in-scope rows that aren't desired, and
 * in-scope duplicates of a key, are deleted.
 */
export function diffBadgeRows(
  existing: ExistingBadgeRow[],
  desired: DesiredBadgeRow[],
  scope: BadgeDiffScope,
): { toInsert: DesiredBadgeRow[]; toDelete: ExistingBadgeRow[]; kept: ExistingBadgeRow[] } {
  const only = scope.onlyBadgeIds;
  const wanted = only ? desired.filter((d) => only.has(d.badgeId)) : desired;
  const desiredKeys = new Set(wanted.map(badgeRowKey));

  // Oldest first so the original grant survives when duplicates exist.
  const sorted = [...existing].sort(
    (a, b) => a.earnedAt.getTime() - b.earnedAt.getTime() || a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  const kept: ExistingBadgeRow[] = [];
  const toDelete: ExistingBadgeRow[] = [];
  for (const row of sorted) {
    const key = badgeRowKey(row);
    const inScope = isRowInDiffScope(row, scope);
    const duplicate = seen.has(key);
    seen.add(key);
    if (inScope && (duplicate || !desiredKeys.has(key))) toDelete.push(row);
    else kept.push(row);
  }

  const keptKeys = new Set(kept.map(badgeRowKey));
  const toInsert = wanted.filter((d) => !keptKeys.has(badgeRowKey(d)));
  return { toInsert, toDelete, kept };
}
