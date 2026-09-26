import { BADGES } from "./badgeDefs";
import type { EarnedBadge, GameData, PickSide, UserPick } from "./types";
import {
  computeAtsResult,
  computeWinPct,
  isGradedForStandings,
  pickCorrectness,
  weekPlEligible,
} from "./scoring";
import { confidencePlForWeek } from "./statsCompute";

/*
 * Badge engine. The badges themselves live in ./badgeDefs.ts; this file turns each completed
 * week into a `WeekView` per player, runs every rule, and diffs the result against the DB.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Rule types (what an entry in badgeDefs.ts looks like)
// ─────────────────────────────────────────────────────────────────────────────

export type RarityName = "legendary" | "epic" | "rare" | "uncommon" | "common";

type RuleCommon = {
  id: string;
  name: string;
  description: string;
  /** One emoji with its own shape (object, face, animal) — it's drawn inside a round medal. */
  icon: string;
  rarity: RarityName;
};

export type BadgeRule =
  | (RuleCommon & { kind: "weekly"; earned: (w: WeekView) => boolean })
  | (RuleCommon & { kind: "first"; earned: (w: WeekView) => boolean })
  | (RuleCommon & { kind: "count"; goal: number; count: (w: WeekView) => number });

export type BadgeKind = BadgeRule["kind"];

/** Tie-aware standing on a board. Co-leaders are all `first`; an all-way tie has no `last`. */
export type BoardStanding = { first: boolean; last: boolean };

export const NO_STANDING: BoardStanding = { first: false, last: false };

/** One of the player's picks on a graded game. */
export type PickView = {
  game: GameData;
  side: PickSide;
  starred: boolean;
  result: "win" | "loss" | "push";
  /** How many players (including you) picked each side. Both 0 when the game has no favorite. */
  crowd: { favorite: number; underdog: number };
  /** Points past the spread for your side (negative = didn't cover). Null if line/score missing. */
  coverBy: number | null;
  /** Null if line/score missing. */
  dogHome: boolean | null;
  dogWonOutright: boolean | null;
  /** Your side was losing ATS at the end of regulation and won ATS after overtime. */
  wonAfterLosingIntoOt: boolean;
};

export type PrimetimeSlot = "tnf" | "snf" | "mnf";

/** One player's completed week, as the rules see it. */
export type WeekView = {
  seasonType: number;
  weekNumber: number;
  /** Graded games in the week (final with an ATS result). */
  gradedGames: number;
  /** Your picks on graded games. */
  picks: PickView[];
  /** Your ★ picks on graded games. */
  starred: PickView[];
  /** Graded games you didn't pick. */
  missed: number;
  /** Wins + ½ per push, over graded games. */
  correct: number;
  winPct: number;
  /** ★ bets placed this week (all games). */
  starsUsed: number;
  /** Week counts for ★ P/L (exactly 5 ★ in the regular season). */
  plEligible: boolean;
  /** Primetime games this week and your pick on each (null pick = didn't pick it). */
  primetime: Record<PrimetimeSlot, { game: GameData; pick: PickView | null } | null>;
  /** This week's boards (ats = win %, pl = ★ P/L). */
  standing: { ats: BoardStanding; pl: BoardStanding };
  /** The previous week of the same season type (NO_STANDING if none / not ranked). */
  lastWeek: { ats: BoardStanding; pl: BoardStanding };
  /** Season-to-date overall boards through this week. */
  overall: { ats: BoardStanding; pl: BoardStanding };
  /** Straight weeks >50% ending this week (★ streak skips ineligible weeks). */
  streak: { ats: number; conf: number };
};

// ─────────────────────────────────────────────────────────────────────────────
// Catalog (derived from badgeDefs.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Higher = rarer (1 common → 5 legendary). */
export type BadgeRarity = 1 | 2 | 3 | 4 | 5;

const RARITY_RANK: Record<RarityName, BadgeRarity> = {
  legendary: 5,
  epic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

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
  icon: string;
  kind: BadgeKind;
  rarity: BadgeRarity;
  rarityName: RarityName;
};

/**
 * Emoji drawn as a square "button" (🔄 🔁 🔂 🔀, keycaps, 🆗-style letters) look like a box stuck
 * inside the round medal, so the list rejects them.
 */
const BOXED_EMOJI = /[\u{1F500}-\u{1F504}\u{1F170}-\u{1F251}\u20E3\u25B6\u23E9-\u23EF]/u;

/** Throws on a malformed list so a bad edit fails tests/build instead of mis-awarding. */
export function validateBadgeRules(rules: readonly BadgeRule[]): void {
  const seen = new Set<string>();
  for (const r of rules) {
    if (!/^[a-z0-9_]+$/.test(r.id)) throw new Error(`Badge id "${r.id}" must be snake_case`);
    if (seen.has(r.id)) throw new Error(`Duplicate badge id "${r.id}"`);
    seen.add(r.id);
    if (!r.name.trim() || !r.description.trim()) throw new Error(`Badge "${r.id}" needs a name and description`);
    if (!r.icon?.trim()) throw new Error(`Badge "${r.id}" needs an icon`);
    if (BOXED_EMOJI.test(r.icon)) throw new Error(`Badge "${r.id}" icon ${r.icon} is a square "button" emoji`);
    if (!(r.rarity in RARITY_RANK)) throw new Error(`Badge "${r.id}" has unknown rarity "${r.rarity}"`);
    if (r.kind === "count" && !(Number.isInteger(r.goal) && r.goal > 0)) {
      throw new Error(`Badge "${r.id}" needs a positive whole-number goal`);
    }
  }
}

validateBadgeRules(BADGES);

/** Catalog ordered rarest → most common (stable within a rarity). */
export const BADGE_CATALOG: BadgeDef[] = BADGES.map((b) => ({
  id: b.id,
  name: b.name,
  description: b.description,
  icon: b.icon,
  kind: b.kind,
  rarity: RARITY_RANK[b.rarity],
  rarityName: b.rarity,
})).sort((a, b) => b.rarity - a.rarity);

const BY_ID = new Map(BADGE_CATALOG.map((b) => [b.id, b]));

export function isKnownBadge(id: string): boolean {
  return BY_ID.has(id);
}

export function badgeName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

export function badgeDescription(id: string): string {
  return BY_ID.get(id)?.description ?? "";
}

export function badgeRarity(id: string): BadgeRarity {
  return BY_ID.get(id)?.rarity ?? 1;
}

export function badgeRarityName(id: string): RarityName {
  return BY_ID.get(id)?.rarityName ?? "common";
}

export function badgeIcon(id: string): string {
  return BY_ID.get(id)?.icon ?? "🏅";
}

/** CSS class that sets the rarity color (`--rc`) for badge styles in src/styles/badges.css. */
export function badgeRarityClass(id: string): string {
  return `rarity-${badgeRarityName(id)}`;
}

/** Sort badge ids rarest first (stable for ties). */
export function compareBadgeRarity(aId: string, bId: string): number {
  const dr = badgeRarity(bId) - badgeRarity(aId);
  if (dr !== 0) return dr;
  return badgeName(aId).localeCompare(badgeName(bId));
}

/**
 * Sentinel `weekNumber` for once-per-season awards ("first" and "count").
 * Must be non-null so Postgres UNIQUE indexes actually enforce one row
 * (NULL ≠ NULL in UNIQUE constraints).
 */
export const SEASON_BADGE_WEEK = 0;

export function isSeasonScopedBadge(weekNumber: number | null | undefined): boolean {
  return weekNumber == null || weekNumber === SEASON_BADGE_WEEK;
}

/**
 * Whether a stored row should be shown. Hides badges no longer in the list (retired ids) and
 * rows whose week doesn't match the badge's kind (legacy rows the next recalculation removes).
 */
export function isDisplayableBadgeAward(badgeId: string, weekNumber: number | null | undefined): boolean {
  const def = BY_ID.get(badgeId);
  if (!def) return false;
  return def.kind === "weekly" ? !isSeasonScopedBadge(weekNumber) : weekNumber === SEASON_BADGE_WEEK;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building a WeekView
// ─────────────────────────────────────────────────────────────────────────────

/** Classify TNF / SNF / MNF from kickoff (US Eastern). */
let easternFmt: Intl.DateTimeFormat | null = null;

export function primetimeSlot(kickoffAt: string): PrimetimeSlot | null {
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

type CrowdCounts = { favorite: number; underdog: number };

function crowdCounts(game: GameData, weekPicksByUser: Iterable<Record<string, UserPick>>): CrowdCounts {
  const out = { favorite: 0, underdog: 0 };
  if (!game.favoriteSide) return out;
  for (const picks of weekPicksByUser) {
    const side = picks[game.id]?.pick;
    if (side) out[side]++;
  }
  return out;
}

function pickView(game: GameData, up: UserPick & { pick: PickSide }, crowd: CrowdCounts): PickView {
  const c = pickCorrectness(up.pick, game.atsResult);
  const view: PickView = {
    game,
    side: up.pick,
    starred: up.isConfidenceBet,
    result: c === 1 ? "win" : c === 0 ? "loss" : "push",
    crowd,
    coverBy: null,
    dogHome: null,
    dogWonOutright: null,
    wonAfterLosingIntoOt: false,
  };
  const { favoriteSide, spread, homeScore, awayScore } = game;
  if (!favoriteSide || spread == null || homeScore == null || awayScore == null || !game.atsResult) {
    return view;
  }
  const favScore = favoriteSide === "home" ? homeScore : awayScore;
  const dogScore = favoriteSide === "home" ? awayScore : homeScore;
  const favCover = favScore - dogScore - Math.abs(spread);
  view.coverBy = up.pick === "favorite" ? favCover : -favCover;
  view.dogHome = favoriteSide === "away";
  view.dogWonOutright = dogScore > favScore;
  if (view.result === "win" && game.preOtHomeScore != null && game.preOtAwayScore != null) {
    const preAts = computeAtsResult(game.preOtHomeScore, game.preOtAwayScore, spread, favoriteSide);
    view.wonAfterLosingIntoOt = preAts != null && preAts !== "push" && preAts !== up.pick;
  }
  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// Season engine (pure): desired rows for a whole season + diff vs. DB rows
// ─────────────────────────────────────────────────────────────────────────────

/** Scores closer than this are treated as tied (float sums of juice-based units). */
const SCORE_EPS = 1e-9;

/**
 * Tie-aware standings for one board. Everyone sharing the top score is `first`;
 * everyone sharing the bottom score is `last` unless the whole board is tied.
 */
export function tieStandings(entries: Array<{ userId: string; score: number }>): Map<string, BoardStanding> {
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

/** One badge row the engine wants to exist. Once-per-season rows use weekNumber 0. */
export type DesiredBadgeRow = {
  userId: string;
  badgeId: string;
  seasonType: number;
  weekNumber: number;
  /** Week whose final results produced this row (for reporting). */
  source: { seasonType: number; weekNumber: number };
};

/** Games still "scheduled" this long after kickoff (canceled / never rescheduled) don't block a week. */
const ABANDONED_GAME_MS = 3 * 24 * 60 * 60 * 1000;

/** A week is evaluated once every game is settled and at least one is graded. */
export function isSlateComplete(games: GameData[], now = new Date()): boolean {
  const settled = (g: GameData) =>
    g.status === "final" ||
    (g.status === "scheduled" && now.getTime() - new Date(g.kickoffAt).getTime() > ABANDONED_GAME_MS);
  return games.length > 0 && games.every(settled) && games.some((g) => isGradedForStandings(g));
}

export function compareSlates(
  a: { seasonType: number; weekNumber: number },
  b: { seasonType: number; weekNumber: number },
): number {
  return a.seasonType - b.seasonType || a.weekNumber - b.weekNumber;
}

/**
 * Identity of a badge row. Once-per-season rows (week 0) are unique per user+badge
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

/** ★ win % for the week (0 when the week isn't ★-eligible). */
function weekConfWinPct(graded: GameData[], picks: Record<string, UserPick>, eligible: boolean): number {
  if (!eligible) return 0;
  let correct = 0;
  let total = 0;
  for (const g of graded) {
    const up = picks[g.id];
    if (!up?.pick || !up.isConfidenceBet) continue;
    total++;
    correct += pickCorrectness(up.pick, g.atsResult);
  }
  return computeWinPct(correct, total);
}

/**
 * Compute every badge row the season's final results justify, by running every rule in
 * `rules` (default: badgeDefs.ts) for every player over every completed week.
 *
 * - Only complete slates (see `isSlateComplete`) are evaluated, oldest → newest by
 *   (seasonType, week), so the regular season precedes the playoffs.
 * - Weekly boards rank only participants (≥1 pick on a graded game). The ★ P/L board ranks only
 *   P/L-eligible participants with ≥1 ★ bet. Ties share first/last.
 * - Overall boards (season to date through the week) use the leaderboard's metrics.
 * - Streaks reset when the season type changes; ★ streaks skip ineligible weeks.
 * - "first" and "count" rows keep the first week that earned them.
 */
export function computeDesiredBadges(input: {
  users: BadgeEngineUser[];
  slates: SeasonSlate[];
  /** userId → public game id → pick, across the season. */
  picksByUser: Map<string, Record<string, UserPick>>;
  rules?: readonly BadgeRule[];
}): { rows: DesiredBadgeRow[]; completedWeeks: Array<{ seasonType: number; weekNumber: number }> } {
  const { users } = input;
  const rules = input.rules ?? BADGES;
  const completed = input.slates.filter((s) => isSlateComplete(s.games)).sort(compareSlates);

  const desired = new Map<string, DesiredBadgeRow>();
  const add = (row: DesiredBadgeRow) => {
    const key = badgeRowKey(row);
    if (!desired.has(key)) desired.set(key, row);
  };

  type Running = {
    ats: number[];
    conf: number[];
    counts: Map<string, number>;
    correct: number;
    total: number;
    pl: number;
    plWeeks: number;
    picked: boolean;
  };
  const running = new Map<string, Running>();
  for (const u of users) {
    running.set(u.userId, {
      ats: [],
      conf: [],
      counts: new Map(),
      correct: 0,
      total: 0,
      pl: 0,
      plWeeks: 0,
      picked: false,
    });
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
    const phase = games[0]?.phase ?? "regular";

    if (lastSeasonType !== seasonType) {
      for (const r of running.values()) {
        r.ats = [];
        r.conf = [];
      }
      lastSeasonType = seasonType;
    }

    // This week's picks per user (games in this slate only).
    const weekPicks = new Map<string, Record<string, UserPick>>();
    for (const u of users) {
      const picks: Record<string, UserPick> = {};
      for (const [gid, p] of Object.entries(input.picksByUser.get(u.userId) ?? {})) {
        if (gameIds.has(gid)) picks[gid] = p;
      }
      weekPicks.set(u.userId, picks);
    }
    const crowdByGame = new Map(graded.map((g) => [g.id, crowdCounts(g, weekPicks.values())]));

    // Per-user week stats + running totals.
    const stats = new Map<
      string,
      { correct: number; winPct: number; pl: number; plEligible: boolean; participant: boolean; starsUsed: number }
    >();
    for (const u of users) {
      const picks = weekPicks.get(u.userId)!;
      let correct = 0;
      for (const g of graded) correct += pickCorrectness(picks[g.id]?.pick ?? null, g.atsResult);
      const winPct = computeWinPct(correct, graded.length);
      const conf = confidencePlForWeek(games, picks);
      const participant = graded.some((g) => picks[g.id]?.pick);
      const st = {
        correct,
        winPct,
        pl: conf.pl,
        plEligible: conf.eligible && conf.confCount > 0,
        participant,
        starsUsed: conf.confCount,
      };
      stats.set(u.userId, st);

      const r = running.get(u.userId)!;
      if (graded.length > 0) r.ats.push(winPct);
      if (conf.eligible) r.conf.push(weekConfWinPct(graded, picks, true));
      r.correct += correct;
      r.total += graded.length;
      if (st.plEligible) {
        r.pl += st.pl;
        r.plWeeks++;
      }
      if (participant) r.picked = true;
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
    const overallAts = tieStandings(
      users
        .filter((u) => running.get(u.userId)!.picked && running.get(u.userId)!.total > 0)
        .map((u) => {
          const r = running.get(u.userId)!;
          return { userId: u.userId, score: computeWinPct(r.correct, r.total) };
        }),
    );
    const overallPl = tieStandings(
      users
        .filter((u) => running.get(u.userId)!.plWeeks > 0)
        .map((u) => ({ userId: u.userId, score: running.get(u.userId)!.pl })),
    );
    const priorBoards =
      prior != null && prior.seasonType === seasonType && prior.weekNumber === weekNumber - 1 ? prior : null;

    for (const u of users) {
      const st = stats.get(u.userId)!;
      const r = running.get(u.userId)!;
      const picks = weekPicks.get(u.userId)!;

      const pickViews: PickView[] = [];
      const viewByGame = new Map<string, PickView>();
      for (const g of graded) {
        const up = picks[g.id];
        if (!up?.pick) continue;
        const v = pickView(g, up as UserPick & { pick: PickSide }, crowdByGame.get(g.id)!);
        pickViews.push(v);
        viewByGame.set(g.id, v);
      }
      const primetime: WeekView["primetime"] = { tnf: null, snf: null, mnf: null };
      for (const g of graded) {
        const slot = primetimeSlot(g.kickoffAt);
        if (slot) primetime[slot] = { game: g, pick: viewByGame.get(g.id) ?? null };
      }

      const w: WeekView = {
        seasonType,
        weekNumber,
        gradedGames: graded.length,
        picks: pickViews,
        starred: pickViews.filter((p) => p.starred),
        missed: graded.length - pickViews.length,
        correct: st.correct,
        winPct: st.winPct,
        starsUsed: st.starsUsed,
        plEligible: weekPlEligible(phase, st.starsUsed),
        primetime,
        standing: { ats: atsBoard.get(u.userId) ?? NO_STANDING, pl: plBoard.get(u.userId) ?? NO_STANDING },
        lastWeek: {
          ats: priorBoards?.ats.get(u.userId) ?? NO_STANDING,
          pl: priorBoards?.pl.get(u.userId) ?? NO_STANDING,
        },
        overall: { ats: overallAts.get(u.userId) ?? NO_STANDING, pl: overallPl.get(u.userId) ?? NO_STANDING },
        streak: { ats: streakEndingAt(r.ats), conf: streakEndingAt(r.conf) },
      };

      for (const rule of rules) {
        let hit: boolean;
        if (rule.kind === "count") {
          const total = (r.counts.get(rule.id) ?? 0) + rule.count(w);
          r.counts.set(rule.id, total);
          hit = total >= rule.goal;
        } else {
          hit = rule.earned(w);
        }
        if (!hit) continue;
        add({
          userId: u.userId,
          badgeId: rule.id,
          seasonType,
          weekNumber: rule.kind === "weekly" ? weekNumber : SEASON_BADGE_WEEK,
          source,
        });
      }
    }

    prior = { seasonType, weekNumber, ats: atsBoard, pl: plBoard };
  }

  return {
    rows: [...desired.values()],
    completedWeeks: completed.map((s) => ({ seasonType: s.seasonType, weekNumber: s.weekNumber })),
  };
}

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
 * - once-per-season rows (week 0): always (every season badge is recomputed, and ids no longer
 *   in the list are retired);
 * - week rows (week > 0) when their (seasonType, week) is a week of the active season, or when
 *   the badge isn't weekly (a legacy row that can never display).
 * Out-of-scope rows still satisfy a desired row with the same key (never duplicated) but are
 * never deleted.
 */
export type BadgeDiffScope = {
  userIds: ReadonlySet<string>;
  /** `${seasonType}-${weekNumber}` for every week of the active season. */
  weekKeys: ReadonlySet<string>;
  seasonStartedAt: Date | null;
};

export function isRowInDiffScope(row: ExistingBadgeRow, scope: BadgeDiffScope): boolean {
  if (!scope.userIds.has(row.userId)) return false;
  if (scope.seasonStartedAt && row.earnedAt.getTime() < scope.seasonStartedAt.getTime()) return false;
  if (row.weekNumber === SEASON_BADGE_WEEK) return true;
  const def = BY_ID.get(row.badgeId);
  if (def && def.kind !== "weekly") return true;
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
  const desiredKeys = new Set(desired.map(badgeRowKey));

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
  const toInsert = desired.filter((d) => !keptKeys.has(badgeRowKey(d)));
  return { toInsert, toDelete, kept };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview: human-readable change list + fingerprint (Apply refuses if it changed)
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeChange = {
  action: "add" | "remove";
  userId: string;
  player: string;
  badgeId: string;
  badgeName: string;
  seasonType: number | null;
  /** null for once-per-season badges. */
  weekNumber: number | null;
  /** Why a row is removed when it isn't a rule outcome (badge no longer in the list, duplicate…). */
  note?: string;
};

/** "chalk_cartel" → "Chalk Cartel" (names of badges no longer in the list). */
function titleCaseId(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function describeBadgeChanges(
  diff: { toInsert: DesiredBadgeRow[]; toDelete: ExistingBadgeRow[]; kept: ExistingBadgeRow[] },
  users: BadgeEngineUser[],
): BadgeChange[] {
  const nameOf = new Map(users.map((u) => [u.userId, u.displayName?.trim() || u.username]));
  const week = (w: number | null) => (isSeasonScopedBadge(w) ? null : w);
  const keptKeys = new Set(diff.kept.map(badgeRowKey));
  const changes: BadgeChange[] = [
    ...diff.toDelete.map((r): BadgeChange => {
      const note = !isKnownBadge(r.badgeId)
        ? "badge no longer in the list"
        : !isDisplayableBadgeAward(r.badgeId, r.weekNumber)
          ? "badge is now once a season"
          : keptKeys.has(badgeRowKey(r))
            ? "duplicate copy"
            : undefined;
      return {
        action: "remove",
        userId: r.userId,
        player: nameOf.get(r.userId) ?? r.userId,
        badgeId: r.badgeId,
        badgeName: isKnownBadge(r.badgeId) ? badgeName(r.badgeId) : titleCaseId(r.badgeId),
        seasonType: r.seasonType,
        weekNumber: week(r.weekNumber),
        ...(note ? { note } : {}),
      };
    }),
    ...diff.toInsert.map(
      (r): BadgeChange => ({
        action: "add",
        userId: r.userId,
        player: nameOf.get(r.userId) ?? r.userId,
        badgeId: r.badgeId,
        badgeName: badgeName(r.badgeId),
        seasonType: r.seasonType,
        weekNumber: week(r.weekNumber),
      }),
    ),
  ];
  return changes.sort(
    (a, b) =>
      a.player.localeCompare(b.player) ||
      (a.action === b.action ? 0 : a.action === "remove" ? -1 : 1) ||
      (a.weekNumber ?? 0) - (b.weekNumber ?? 0) ||
      a.badgeName.localeCompare(b.badgeName),
  );
}

/** Stable fingerprint of a diff (FNV-1a over the sorted change keys). */
export function badgeDiffFingerprint(diff: { toInsert: DesiredBadgeRow[]; toDelete: ExistingBadgeRow[] }): string {
  const lines = [
    ...diff.toInsert.map((r) => `+${badgeRowKey(r)}`),
    ...diff.toDelete.map((r) => `-${r.id}`),
  ].sort();
  let h = 0x811c9dc5;
  for (const ch of lines.join("\n")) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${lines.length}-${h.toString(16)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Display: one entry per badge, repeats counted
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeGroup = {
  badgeId: string;
  name: string;
  description: string;
  /** How many times it was earned (weekly badges can repeat). */
  count: number;
  /** Weeks it was earned, oldest first; empty for once-a-season badges. */
  weeks: Array<{ seasonType: number | null; weekNumber: number }>;
  /** Most recent earnedAt (ISO). */
  earnedAt: string;
};

/** Collapse repeated awards of the same badge into one entry, rarest badges first. */
export function groupEarnedBadges(badges: EarnedBadge[]): BadgeGroup[] {
  const byId = new Map<string, BadgeGroup>();
  for (const b of badges) {
    let g = byId.get(b.badgeId);
    if (!g) {
      g = { badgeId: b.badgeId, name: b.name, description: b.description, count: 0, weeks: [], earnedAt: b.earnedAt };
      byId.set(b.badgeId, g);
    }
    g.count++;
    if (!isSeasonScopedBadge(b.weekNumber)) g.weeks.push({ seasonType: b.seasonType, weekNumber: b.weekNumber! });
    if (b.earnedAt > g.earnedAt) g.earnedAt = b.earnedAt;
  }
  for (const g of byId.values()) {
    g.weeks.sort((a, b) => (a.seasonType ?? 2) - (b.seasonType ?? 2) || a.weekNumber - b.weekNumber);
  }
  return [...byId.values()].sort((a, b) => compareBadgeRarity(a.badgeId, b.badgeId));
}
