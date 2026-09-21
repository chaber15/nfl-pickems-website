import type { GameData, WeekPhase } from "./types";
import { computeAtsResult, parseAmericanOdds } from "./scoring";
import { sortGamesLiveFirstThenChronological } from "./gameOrder";
import { clampToAvailableWeek, isAfterTuesdayNoonEt, nextAvailableWeek } from "./weekUtils";

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ODDS_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events";

interface EspnTeam {
  homeAway: "home" | "away";
  team: {
    displayName: string;
    abbreviation: string;
  };
  score?: string;
  records?: Array<{
    type?: string;
    summary?: string;
  }>;
}

interface EspnOddsBlock {
  spread?: number;
  awayTeamOdds?: EspnSideOdds;
  homeTeamOdds?: EspnSideOdds;
}

interface EspnSideOdds {
  favorite?: boolean;
  moneyLine?: number;
  spreadOdds?: number;
  close?: {
    spread?: { american?: string };
    moneyLine?: { american?: string };
  };
  current?: {
    spread?: { american?: string };
    moneyLine?: { american?: string };
  };
}


interface EspnEvent {
  id: string;
  date: string;
  competitions: Array<{
    id: string;
    date: string;
    competitors: EspnTeam[];
    odds?: EspnOddsBlock[];
    status?: {
      period?: number;
      displayClock?: string;
      type?: {
        name?: string;
        completed?: boolean;
        state?: string;
        shortDetail?: string;
        detail?: string;
        description?: string;
      };
    };
  }>;
  season?: { type?: number };
  week?: { number?: number };
}

interface EspnScoreboard {
  events?: EspnEvent[];
  season?: { type?: number; year?: number };
  week?: { number?: number };
}

/** NFL season year (year of that season’s Week 1), not necessarily the calendar year. */
export function seasonYearFromScoreboard(
  data: Pick<EspnScoreboard, "season">,
  seasonType: number,
  fallbackDate = new Date(),
): number {
  const fromEspn = data.season?.year;
  if (fromEspn != null && fromEspn >= 2000 && fromEspn <= 2100) return fromEspn;

  // Jan–February: regular season / playoffs still belong to the prior NFL year
  const y = fallbackDate.getFullYear();
  const m = fallbackDate.getMonth();
  if (m <= 1 && (seasonType === 2 || seasonType === 3)) return y - 1;
  return y;
}

function mapPhase(seasonType: number, weekNumber: number): WeekPhase {
  if (seasonType === 1) return "preseason";
  if (seasonType === 3) {
    if (weekNumber === 1) return "wildcard";
    if (weekNumber === 2) return "divisional";
    if (weekNumber === 3) return "conf";
    return "superbowl";
  }
  return "regular";
}

const LIVE_STATUS_NAMES = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_HALFTIME",
  "STATUS_END_PERIOD",
  "STATUS_END_OF_PERIOD",
  "STATUS_OVERTIME",
  "STATUS_FIRST_HALF",
  "STATUS_SECOND_HALF",
  "STATUS_DELAYED",
  "STATUS_RAIN_DELAY",
]);

function mapStatus(
  name?: string,
  completed?: boolean,
  state?: string,
): GameData["status"] {
  if (completed || name === "STATUS_FINAL" || state === "post") return "final";
  if (state === "in" || (name != null && LIVE_STATUS_NAMES.has(name))) return "in_progress";
  return "scheduled";
}

function liveStatusDetail(
  name?: string,
  period?: number | null,
  shortDetail?: string,
  description?: string,
): string | null {
  if (name === "STATUS_HALFTIME") return "Halftime";
  if (name === "STATUS_END_PERIOD" || name === "STATUS_END_OF_PERIOD") {
    if (period === 2) return "Halftime";
    if (period != null && period >= 5) return "End of OT";
    if (period != null) return `End of Q${period}`;
    return shortDetail ?? description ?? "End of period";
  }
  if (period != null && period >= 5) return "OT";
  if (shortDetail?.toLowerCase().includes("halftime")) return "Halftime";
  if (shortDetail?.toLowerCase().includes("ot")) return "OT";
  return shortDetail ?? description ?? null;
}

/** Spread juice / vig only — never moneyline. Used for confidence P/L units. */
function extractSpreadJuice(side: EspnSideOdds | undefined): number | null {
  if (!side) return null;
  return (
    parseAmericanOdds(side.current?.spread?.american) ??
    parseAmericanOdds(side.close?.spread?.american) ??
    parseAmericanOdds(side.spreadOdds)
  );
}

function extractOdds(oddsBlock: EspnOddsBlock | undefined): {
  spread: number | null;
  favoriteSide: "home" | "away" | null;
  oddsAway: number | null;
  oddsHome: number | null;
} {
  if (!oddsBlock) {
    return { spread: null, favoriteSide: null, oddsAway: null, oddsHome: null };
  }

  const spread = oddsBlock.spread != null ? Math.abs(Number(oddsBlock.spread)) : null;
  let favoriteSide: "home" | "away" | null = null;
  if (oddsBlock.homeTeamOdds?.favorite) favoriteSide = "home";
  else if (oddsBlock.awayTeamOdds?.favorite) favoriteSide = "away";

  return {
    spread,
    favoriteSide,
    oddsAway: extractSpreadJuice(oddsBlock.awayTeamOdds),
    oddsHome: extractSpreadJuice(oddsBlock.homeTeamOdds),
  };
}

async function fetchOddsFallback(eventId: string, competitionId: string): Promise<EspnOddsBlock | null> {
  try {
    const res = await fetch(`${ODDS_URL}/${eventId}/competitions/${competitionId}/odds`);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<EspnOddsBlock & { $ref?: string }> };
    const item = data.items?.[0];
    if (!item) return null;
    // List payload often already includes full odds; prefer that over fragile $ref fetches.
    if (item.awayTeamOdds || item.homeTeamOdds || item.spread != null) {
      return item;
    }
    const ref = item.$ref?.replace(/^http:\/\//, "https://");
    if (!ref) return null;
    const detailRes = await fetch(ref);
    if (!detailRes.ok) return null;
    return (await detailRes.json()) as EspnOddsBlock;
  } catch {
    return null;
  }
}

function extractTeamRecord(competitor: EspnTeam): string | null {
  const records = competitor.records;
  if (!records?.length) return null;
  const total = records.find((r) => r.type === "total") ?? records[0];
  const summary = total?.summary?.trim();
  return summary || null;
}

function parseEvent(event: EspnEvent, oddsBlock?: EspnOddsBlock | null): GameData | null {
  const comp = event.competitions[0];
  if (!comp) return null;

  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const embeddedOdds = comp.odds?.[0];
  // Prefer the caller-supplied block (often the odds API with juice) over scoreboard embeds.
  const odds = extractOdds(oddsBlock ?? embeddedOdds ?? undefined);
  const seasonType = event.season?.type ?? 1;
  const weekNumber = event.week?.number ?? 1;
  const statusName = comp.status?.type?.name;
  const period = comp.status?.period ?? null;
  const displayClock = comp.status?.displayClock ?? null;
  const statusDetail = liveStatusDetail(
    statusName,
    period,
    comp.status?.type?.shortDetail,
    comp.status?.type?.description,
  );

  const game: GameData = {
    id: event.id,
    espnEventId: event.id,
    awayTeam: away.team.displayName,
    awayAbbrev: away.team.abbreviation,
    homeTeam: home.team.displayName,
    homeAbbrev: home.team.abbreviation,
    awayRecord: extractTeamRecord(away),
    homeRecord: extractTeamRecord(home),
    kickoffAt: comp.date || event.date,
    spread: odds.spread,
    favoriteSide: odds.favoriteSide,
    oddsAway: odds.oddsAway,
    oddsHome: odds.oddsHome,
    atsResult: null,
    status: mapStatus(statusName, comp.status?.type?.completed, comp.status?.type?.state),
    awayScore: away.score != null ? Number(away.score) : undefined,
    homeScore: home.score != null ? Number(home.score) : undefined,
    period,
    displayClock,
    statusDetail,
    weekNumber,
    seasonType,
    phase: mapPhase(seasonType, weekNumber),
  };

  return applyAtsToGame(game);
}

export function applyAtsToGame(game: GameData): GameData {
  if (
    game.status !== "final" ||
    game.spread == null ||
    !game.favoriteSide ||
    game.awayScore == null ||
    game.homeScore == null
  ) {
    return game;
  }
  return {
    ...game,
    atsResult: computeAtsResult(game.homeScore, game.awayScore, game.spread, game.favoriteSide),
  };
}

export async function fetchScoreboard(
  seasonType = 1,
  week = 2,
): Promise<{ games: GameData[]; seasonType: number; week: number; seasonYear: number }> {
  const url = `${SCOREBOARD_URL}?seasontype=${seasonType}&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard failed: ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;

  const events = data.events ?? [];
  const games: GameData[] = [];
  const resolvedType = data.season?.type ?? seasonType;

  for (const event of events) {
    const comp = event.competitions[0];
    let oddsBlock: EspnOddsBlock | null = comp?.odds?.[0] ?? null;
    const embedded = extractOdds(oddsBlock ?? undefined);
    const needsJuice =
      !oddsBlock ||
      embedded.oddsAway == null ||
      embedded.oddsHome == null ||
      embedded.spread == null ||
      !embedded.favoriteSide;
    if (needsJuice && comp) {
      const fallback = await fetchOddsFallback(event.id, comp.id);
      if (fallback) oddsBlock = fallback;
    }
    const game = parseEvent(event, oddsBlock);
    if (game) games.push(game);
  }

  const sorted = sortGamesLiveFirstThenChronological(games);

  return {
    games: sorted,
    seasonType: resolvedType,
    week: data.week?.number ?? week,
    seasonYear: seasonYearFromScoreboard(data, resolvedType),
  };
}

export async function fetchCurrentScoreboard(): Promise<{
  games: GameData[];
  seasonType: number;
  week: number;
  seasonYear: number;
}> {
  const res = await fetch(SCOREBOARD_URL);
  if (!res.ok) throw new Error(`ESPN scoreboard failed: ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  const seasonType = data.season?.type ?? 2;
  const week = data.week?.number ?? 1;
  return fetchScoreboard(seasonType, week);
}

/** Detect current NFL week from ESPN calendar (no week params). */
export async function detectCurrentWeek(): Promise<{
  seasonType: number;
  week: number;
  seasonYear: number;
}> {
  const res = await fetch(SCOREBOARD_URL);
  if (!res.ok) throw new Error(`ESPN scoreboard failed: ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  const seasonType = data.season?.type ?? 2;
  return {
    seasonType,
    week: data.week?.number ?? 1,
    seasonYear: seasonYearFromScoreboard(data, seasonType),
  };
}

/**
 * Default home-page week: ESPN current, but after Tuesday noon ET advance to the
 * next slate once the ESPN week is fully final (ESPN often lags after MNF).
 */
export async function resolveCurrentPickemsWeek(now = new Date()): Promise<{
  seasonType: number;
  week: number;
  seasonYear: number;
}> {
  const current = await detectCurrentWeek();
  let seasonType = current.seasonType;
  let week = current.week;
  const clamped = clampToAvailableWeek(seasonType, week);
  seasonType = clamped.seasonType;
  week = clamped.week;

  if (!isAfterTuesdayNoonEt(now)) {
    return { seasonType, week, seasonYear: current.seasonYear };
  }

  try {
    const board = await fetchScoreboard(seasonType, week);
    const games = board.games;
    const finished =
      games.length === 0 || games.every((g) => g.status === "final");
    if (!finished) {
      return { seasonType, week, seasonYear: current.seasonYear };
    }

    const next = nextAvailableWeek(seasonType, week);
    if (next.seasonType === seasonType && next.week === week) {
      return { seasonType, week, seasonYear: current.seasonYear };
    }

    const nextBoard = await fetchScoreboard(next.seasonType, next.week);
    if (nextBoard.games.length > 0) {
      return {
        seasonType: next.seasonType,
        week: next.week,
        seasonYear: current.seasonYear,
      };
    }
  } catch {
    /* fall through to ESPN week */
  }

  return { seasonType, week, seasonYear: current.seasonYear };
}
