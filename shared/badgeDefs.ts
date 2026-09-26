/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE BADGE LIST — the only file you edit to add, change, or remove a badge.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Each badge is one entry:
 *   id           Permanent key stored in the database. Never change it once live
 *                (renaming an id = removing the old badge and adding a new one).
 *   name         Shown on the chip. Safe to change any time.
 *   icon         One emoji drawn inside a round medal. Use objects, faces or animals — not square
 *                "button" emoji like 🔄 (the list rejects those).
 *   description  Shown in the tooltip. Safe to change any time.
 *   rarity       "legendary" | "epic" | "rare" | "uncommon" | "common" (chip color + sort order).
 *   kind         "weekly" — can be earned every week (one per week).
 *                "first"  — once per season, the first week `earned` is true.
 *                "count"  — once per season, when the season's running total of `count` reaches `goal`.
 *
 * `w` is a read-only summary of one player's completed week (see `WeekView` in ./badges.ts):
 *   w.picks / w.starred   your graded picks (each: side, starred, result, crowd, coverBy, …)
 *   w.missed, w.winPct, w.correct, w.gradedGames, w.plEligible, w.primetime.{tnf,snf,mnf}
 *   w.standing / w.lastWeek / w.overall   { ats, pl } → { first, last } (ties share first/last)
 *   w.streak.{ats,conf}   straight weeks >50% ending this week
 *
 * Rarity targets (per badge, ~11 players, full season), tuned by replaying the real 2025 season:
 *   legendary ≈ once every season or two · epic 1–3× · rare 3–8× (25–50% of players)
 *   uncommon 5–12× (50–80%) · common: most players. A typical player earns ~8–12 badges a season.
 * Tips: `=== N` on a streak awards once per streak (`>= N` would fire every extra week).
 * `fullWeek` keeps "great/bad week" badges off 1–2 game playoff weeks.
 *
 * After changing this file:
 *   1. `npm test` — the golden-season snapshot test lists exactly who gains/loses what.
 *      If the change is intended, accept it with `UPDATE_SNAPSHOTS=1 npm test`.
 *   2. Deploy, then Admin → Badges → Preview recalculation → Apply.
 *      (The hourly job only ever ADDS badges; removals happen only when you press Apply.)
 */
import type { BadgeRule, PickView, WeekView } from "./badges";
import { computeWinPct } from "./scoring";

/** A real week: regular season with 10+ graded games (not a 1–2 game playoff week). */
const fullWeek = (w: WeekView) => w.seasonType === 2 && w.gradedGames >= 10;
/** Super Bowl week (ESPN postseason week 5): the season's final standings. */
const seasonFinale = (w: WeekView) => w.seasonType === 3 && w.weekNumber === 5;
/** Overall #1 only counts from week 4 on (after week 1 half the league is tied for first). */
const pastWeek3 = (w: WeekView) => w.seasonType !== 2 || w.weekNumber >= 4;

const allWins = (picks: PickView[]) => picks.every((p) => p.result === "win");
const starWins = (w: WeekView) => w.starred.filter((p) => p.result === "win").length;
const sideShare = (w: WeekView, side: PickView["side"]) =>
  w.picks.length > 0 ? w.picks.filter((p) => p.side === side).length / w.picks.length : 0;
/** Share of the family (who picked the game) on this side. Null if nobody's split is known. */
const crowdShare = (p: PickView, side: PickView["side"]) => {
  const total = p.crowd.favorite + p.crowd.underdog;
  return total > 0 ? p.crowd[side] / total : null;
};

/** Ordered rarest → most common (the order the admin catalog shows). */
export const BADGES: BadgeRule[] = [
  // —— Legendary ——
  {
    id: "crystal_ball",
    name: "Crystal Ball",
    icon: "🔮",
    description: "Win 80% or more of your picks in a full week.",
    rarity: "legendary",
    kind: "weekly",
    earned: (w) => fullWeek(w) && w.winPct >= 80,
  },
  {
    id: "primetime",
    name: "Primetime",
    icon: "📺",
    description: "Star the Thursday, Sunday and Monday night games and win all three in the same week.",
    rarity: "legendary",
    kind: "weekly",
    earned: (w) => {
      const { tnf, snf, mnf } = w.primetime;
      if (!tnf || !snf || !mnf) return false;
      return [tnf, snf, mnf].every((s) => s.pick?.starred && s.pick.result === "win");
    },
  },
  {
    id: "playoff_prophet",
    name: "Playoff Prophet",
    icon: "🏆",
    description: "Get at least 10 of the 13 playoff games right.",
    rarity: "legendary",
    kind: "count",
    goal: 10,
    count: (w) => (w.seasonType === 3 ? w.correct : 0),
  },

  // —— Epic ——
  {
    id: "season_champion",
    name: "Season Champion",
    icon: "👑",
    description: "Finish the season #1 in win %.",
    rarity: "epic",
    kind: "first",
    earned: (w) => seasonFinale(w) && w.overall.ats.first,
  },
  {
    id: "bankroll_king",
    name: "Bankroll King",
    icon: "💰",
    description: "Finish the season #1 in star P/L.",
    rarity: "epic",
    kind: "first",
    earned: (w) => seasonFinale(w) && w.overall.pl.first,
  },
  {
    id: "money_printer",
    name: "Money Printer",
    icon: "💸",
    description: "Win more than half your star bets five weeks in a row.",
    rarity: "epic",
    kind: "weekly",
    earned: (w) => w.streak.conf === 5,
  },
  {
    id: "giant_killer",
    name: "Giant Killer",
    icon: "🗡️",
    description: "Star an underdog getting 10 or more points that wins the game outright.",
    rarity: "epic",
    kind: "weekly",
    earned: (w) =>
      w.starred.some((p) => p.side === "underdog" && p.dogWonOutright === true && (p.game.spread ?? 0) >= 10),
  },
  {
    id: "contrarian",
    name: "Contrarian",
    icon: "🙃",
    description: "Go against most of the family on 7+ picks in a full week and win 70% of them.",
    rarity: "epic",
    kind: "weekly",
    earned: (w) => {
      const against = w.picks.filter((p) => (crowdShare(p, p.side) ?? 1) < 0.5);
      const hits = against.filter((p) => p.result === "win").length;
      return fullWeek(w) && against.length >= 7 && hits / against.length >= 0.7;
    },
  },

  // —— Rare ——
  {
    id: "five_star_general",
    name: "Five-Star General",
    icon: "🎖️",
    description: "All five of your stars win.",
    rarity: "rare",
    kind: "weekly",
    earned: (w) => w.starred.length === 5 && allWins(w.starred),
  },
  {
    id: "sniper",
    name: "Sniper",
    icon: "🎯",
    description: "Win 4 or 5 of your stars in a week where you lost most of your picks.",
    rarity: "rare",
    kind: "weekly",
    earned: (w) => w.starred.length === 5 && starWins(w) >= 4 && w.winPct < 50,
  },
  {
    id: "repeat_champ",
    name: "Repeat Champ",
    icon: "✌️",
    description: "Top the weekly win % board two weeks in a row.",
    rarity: "rare",
    kind: "weekly",
    earned: (w) => w.lastWeek.ats.first && w.standing.ats.first,
  },
  {
    id: "lone_wolf",
    name: "Lone Wolf",
    icon: "🐺",
    description: "Three times this season, be the only one on your side of a game and win it.",
    rarity: "rare",
    kind: "count",
    goal: 3,
    // Only counts when at least 6 others took the other side, so it means "everyone else".
    count: (w) =>
      w.picks.filter((p) => {
        const others = p.side === "favorite" ? p.crowd.underdog : p.crowd.favorite;
        return p.result === "win" && p.crowd[p.side] === 1 && others >= 6;
      }).length,
  },
  {
    id: "hot_hand",
    name: "Hot Hand",
    icon: "🔥",
    description: "Win more than half your picks three weeks in a row.",
    rarity: "rare",
    kind: "weekly",
    earned: (w) => w.streak.ats === 3,
  },
  {
    id: "from_the_dead_ats",
    name: "From the Dead",
    icon: "🧟",
    description: "Last place one week, first place the next.",
    rarity: "rare",
    kind: "weekly",
    earned: (w) => w.lastWeek.ats.last && w.standing.ats.first,
  },
  {
    id: "high_roller",
    name: "High Roller",
    icon: "🎲",
    description: "Reach #1 overall in win % (week 4 or later).",
    rarity: "rare",
    kind: "first",
    earned: (w) => pastWeek3(w) && w.overall.ats.first,
  },
  {
    id: "throne_room",
    name: "Throne Room",
    icon: "🏰",
    description: "Reach #1 overall in star P/L (week 4 or later).",
    rarity: "rare",
    kind: "first",
    earned: (w) => pastWeek3(w) && w.overall.pl.first,
  },
  {
    id: "steamroller",
    name: "Steamroller",
    icon: "🚜",
    description: "Three starred favorites this season that beat the spread by 21+ points.",
    rarity: "rare",
    kind: "count",
    goal: 3,
    count: (w) =>
      w.starred.filter((p) => p.side === "favorite" && p.coverBy != null && p.coverBy >= 21).length,
  },

  // —— Uncommon ——
  {
    id: "ot_hero",
    name: "OT Hero",
    icon: "⏱️",
    description: "A starred pick that was losing at the end of regulation wins in overtime.",
    rarity: "uncommon",
    kind: "weekly",
    earned: (w) => w.starred.some((p) => p.wonAfterLosingIntoOt),
  },
  {
    id: "monday_miracle",
    name: "Monday Miracle",
    icon: "🙏",
    description: "Your Monday night pick turns a losing week into a winning one.",
    rarity: "uncommon",
    kind: "weekly",
    earned: (w) => {
      if (!fullWeek(w) || w.primetime.mnf?.pick?.result !== "win") return false;
      return computeWinPct(w.correct - 1, w.gradedGames - 1) <= 50 && w.winPct > 50;
    },
  },
  {
    id: "by_a_nose",
    name: "By a Nose",
    icon: "👃",
    description: "Five starred picks this season that cover by 1½ points or less.",
    rarity: "uncommon",
    kind: "count",
    goal: 5,
    count: (w) => w.starred.filter((p) => p.coverBy != null && p.coverBy > 0 && p.coverBy <= 1.5).length,
  },
  {
    id: "road_dog",
    name: "Road Dog",
    icon: "🐕",
    description: "Nine starred road underdogs this season that cover.",
    rarity: "uncommon",
    kind: "count",
    goal: 9,
    count: (w) =>
      w.starred.filter((p) => p.side === "underdog" && p.result === "win" && p.dogHome === false).length,
  },
  {
    id: "creature_of_habit",
    name: "Creature of Habit",
    icon: "🐑",
    description: "Pick the same side (favorites or underdogs) on 80% or more of a full week.",
    rarity: "uncommon",
    kind: "weekly",
    earned: (w) => fullWeek(w) && Math.max(sideShare(w, "favorite"), sideShare(w, "underdog")) >= 0.8,
  },

  // —— Common ——
  {
    id: "week_champion",
    name: "Week Champion",
    icon: "🥇",
    description: "Top a weekly board (win % or star P/L) for the first time this season.",
    rarity: "common",
    kind: "first",
    earned: (w) => w.standing.ats.first || w.standing.pl.first,
  },
  {
    id: "cellar_dweller",
    name: "Cellar Dweller",
    icon: "🐀",
    description: "Finish last in three weeks this season.",
    rarity: "common",
    kind: "count",
    goal: 3,
    count: (w) => (w.seasonType === 2 && w.standing.ats.last ? 1 : 0),
  },
  {
    id: "busted_five",
    name: "Busted Five",
    icon: "💥",
    description: "All five of your stars lose.",
    rarity: "common",
    kind: "weekly",
    earned: (w) => w.starred.length === 5 && starWins(w) === 0,
  },
  {
    id: "fall_from_grace_ats",
    name: "Fall From Grace",
    icon: "🪂",
    description: "First place one week, last place the next.",
    rarity: "common",
    kind: "weekly",
    earned: (w) => w.lastWeek.ats.first && w.standing.ats.last,
  },
  {
    id: "no_show",
    name: "No Show",
    icon: "👻",
    description: "Skip a game in a week you picked others (first time this season).",
    rarity: "common",
    kind: "first",
    earned: (w) => w.missed > 0 && w.picks.length > 0,
  },
  {
    id: "unstarred",
    name: "Unstarred",
    icon: "💤",
    description: "Forget to place exactly 5 stars (first time this season).",
    rarity: "common",
    kind: "first",
    earned: (w) => w.picks.length > 0 && !w.plEligible,
  },
];
