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
    description: "★ underdog wins outright",
    scope: "week",
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
    description: "★ favorite covers by 14+",
    scope: "week",
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
export function primetimeSlot(kickoffAt: string): PrimetimeSlot {
  const d = new Date(kickoffAt);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
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

/** Lifetime thresholds for cumulative ★-bet badges (not per-week). */
export const LIFETIME_BADGE_THRESHOLDS = {
  by_a_nose: 3,
  juice_box: 5,
  road_dog: 5,
} as const;

export const LIFETIME_THRESHOLD_BADGE_IDS = ["by_a_nose", "juice_box", "road_dog"] as const;

export type LifetimeThresholdBadgeId = (typeof LIFETIME_THRESHOLD_BADGE_IDS)[number];

export function isLifetimeThresholdBadge(id: string): id is LifetimeThresholdBadgeId {
  return (LIFETIME_THRESHOLD_BADGE_IDS as readonly string[]).includes(id);
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

export type LifetimeBadgeCounts = {
  by_a_nose: number;
  juice_box: number;
  road_dog: number;
};

/** Count ★ events that feed lifetime badges for one week of games. */
export function countLifetimeBadgeEvents(
  games: GameData[],
  picks: Record<string, UserPick>,
): LifetimeBadgeCounts {
  let by_a_nose = 0;
  let juice_box = 0;
  let road_dog = 0;

  for (const g of games) {
    if (!isGradedForStandings(g)) continue;
    const up = picks[g.id];
    if (!up?.pick || !up.isConfidenceBet) continue;
    if (!g.favoriteSide || g.spread == null || g.awayScore == null || g.homeScore == null || !g.atsResult) {
      continue;
    }

    if (up.pick === "underdog") {
      const dogIsHome = g.favoriteSide === "away";
      const margin = coverMargin(g.homeScore, g.awayScore, g.spread, g.favoriteSide, up.pick);
      if (margin != null && margin > 0 && margin <= 1.5) by_a_nose++;
      if (pickCorrectness(up.pick, g.atsResult) === 1) {
        if (dogIsHome) juice_box++;
        else road_dog++;
      }
    }

    if (up.pick === "favorite") {
      const margin = coverMargin(g.homeScore, g.awayScore, g.spread, g.favoriteSide, up.pick);
      if (margin != null && margin > 0 && margin <= 1.5) by_a_nose++;
    }
  }

  return { by_a_nose, juice_box, road_dog };
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
 * Evaluate badges for one user for a completed week.
 * `priorWeekRanks` / `weekRanks` are 0-based ranks (0 = first) among active players.
 * `atsStreak` / `confStreak` are current week-ending streaks including this week.
 */
export function evaluateWeekBadges(args: {
  games: GameData[];
  seasonType: number;
  weekNumber: number;
  player: WeekPlayerContext;
  allPlayers: WeekComparePlayer[];
  atsStreak: number;
  confStreak: number;
  weekRankAts: number;
  weekRankPl: number;
  playerCount: number;
  priorWeekRankAts: number | null;
  priorWeekRankPl: number | null;
  priorPlayerCount: number | null;
  alreadyHasHowl: boolean;
  alreadyHasNoShow: boolean;
  alreadyHasWeekChampion: boolean;
  alreadyHasBankrollKing: boolean;
}): BadgeAward[] {
  const {
    games,
    seasonType,
    weekNumber,
    player,
    allPlayers,
    atsStreak,
    confStreak,
    weekRankAts,
    weekRankPl,
    playerCount,
    priorWeekRankAts,
    priorWeekRankPl,
    priorPlayerCount,
    alreadyHasHowl,
    alreadyHasNoShow,
    alreadyHasWeekChampion,
    alreadyHasBankrollKing,
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
  if (graded.every((g) => pickCorrectness(picks[g.id]?.pick ?? null, g.atsResult) === 0)) {
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
    if (!alreadyHasHowl) season("howl");
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

  if (weekRankAts === 0 && !alreadyHasWeekChampion) season("week_champion");
  if (weekRankPl === 0 && !alreadyHasBankrollKing) season("bankroll_king");

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
      const dogIsHome = g.favoriteSide === "away";
      const dogScore = dogIsHome ? g.homeScore : g.awayScore;
      const favScore = dogIsHome ? g.awayScore : g.homeScore;
      if (dogScore > favScore && pickCorrectness(up.pick, g.atsResult) === 1) week("bite_back");

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

    if (up.pick === "favorite") {
      const margin = coverMargin(g.homeScore, g.awayScore, g.spread, g.favoriteSide, up.pick);
      if (margin != null && margin >= 14) week("steamroller");
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

  // From the Dead / Fall From Grace
  if (priorWeekRankAts != null && priorPlayerCount != null && priorPlayerCount > 1) {
    const wasLast = priorWeekRankAts === priorPlayerCount - 1;
    const wasFirst = priorWeekRankAts === 0;
    if (wasLast && weekRankAts === 0) week("from_the_dead_ats");
    if (wasFirst && weekRankAts === playerCount - 1) week("fall_from_grace_ats");
  }
  if (priorWeekRankPl != null && priorPlayerCount != null && priorPlayerCount > 1) {
    const wasLast = priorWeekRankPl === priorPlayerCount - 1;
    const wasFirst = priorWeekRankPl === 0;
    if (wasLast && weekRankPl === 0) week("from_the_dead_pl");
    if (wasFirst && weekRankPl === playerCount - 1) week("fall_from_grace_pl");
  }

  if (!alreadyHasNoShow && missed.length > 0 && pickedGames.length > 0) {
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
