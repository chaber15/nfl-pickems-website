import type { GameData } from "./types";
import { computeAtsResult, parseAmericanOdds } from "./scoring";
import { sortGamesLiveFirstThenChronological } from "./gameOrder";
import { clampToAvailableWeek, isAfterTuesdayNoonEt, nextAvailableWeek, phaseFor } from "./weekUtils";

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ODDS_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events";

/** Every ESPN request is aborted after this long so a slow ESPN can't eat the function budget. */
export const ESPN_FETCH_TIMEOUT_MS = 5000;
/** Parallel odds fallback lookups per scoreboard. */
const ODDS_FALLBACK_CONCURRENCY = 4;

interface EspnTeam {
  homeAway: "home" | "away";
  team?: {
    displayName?: string;
    abbreviation?: string;
  };
  score?: string | number;
  records?: Array<{
    type?: string;
    summary?: string;
  }>;
}

interface EspnOddsBlock {
  spread?: number | string;
  details?: string;
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
  competitions?: Array<{
    id: string;
    date: string;
    competitors?: EspnTeam[];
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

export interface ScoreboardResult {
  games: GameData[];
  seasonType: number;
  week: number;
  seasonYear: number;
}

export interface ScoreboardOptions {
  /** Look up juice via the odds API when the scoreboard embed is incomplete (default true). */
  withOddsFallback?: boolean;
  /**
   * Called once (before any odds lookups) with every event on the board; returns event ids
   * whose odds fallback should be skipped (e.g. past line lock with a complete stored line).
   */
  skipOddsFallback?: (
    events: Array<{ eventId: string; kickoffAt: string }>,
  ) => Promise<Set<string>> | Set<string>;
}

/** fetch + JSON with an AbortController timeout covering headers and body. */
async function fetchJson<T>(url: string, label: string, timeoutMs = ESPN_FETCH_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`${label} timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
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

const LIVE_STATUS_NAMES = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_HALFTIME",
  "STATUS_END_PERIOD",
  "STATUS_END_OF_PERIOD",
  "STATUS_OVERTIME",
  "STATUS_FIRST_HALF",
  "STATUS_SECOND_HALF",
]);

/** Games that were not (fully) played — never final, never graded. */
const NOT_PLAYED_STATUS_NAMES = new Set([
  "STATUS_POSTPONED",
  "STATUS_CANCELED",
  "STATUS_CANCELLED",
  "STATUS_SUSPENDED",
]);

const DELAY_STATUS_NAMES = new Set(["STATUS_DELAYED", "STATUS_RAIN_DELAY"]);

/**
 * Final only when ESPN says so explicitly (`completed` or STATUS_FINAL*, which covers
 * "Final/OT" — ESPN keeps name STATUS_FINAL for OT). `state === "post"` alone is NOT final:
 * postponed / canceled games also report "post".
 */
export function mapStatus(
  name?: string,
  completed?: boolean,
  state?: string,
): GameData["status"] {
  if (name != null && NOT_PLAYED_STATUS_NAMES.has(name)) return "scheduled";
  if (completed === true || (name != null && name.startsWith("STATUS_FINAL"))) return "final";
  if (name != null && DELAY_STATUS_NAMES.has(name)) return state === "in" ? "in_progress" : "scheduled";
  if (state === "in" || (name != null && LIVE_STATUS_NAMES.has(name))) return "in_progress";
  return "scheduled";
}

const OT_PATTERN = /\bOT\b|\bovertime\b/i;

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
  if (shortDetail && /halftime/i.test(shortDetail)) return "Halftime";
  if (shortDetail && OT_PATTERN.test(shortDetail)) return "OT";
  return shortDetail ?? description ?? null;
}

function prettyStatusName(name: string): string {
  const s = name.replace(/^STATUS_/, "").replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** statusDetail label; postponed / canceled / delayed keep ESPN's text so the UI can show it. */
export function statusDetailFor(
  name: string | undefined,
  state: string | undefined,
  period: number | null,
  shortDetail?: string,
  description?: string,
): string | null {
  const notPlayed =
    (name != null && NOT_PLAYED_STATUS_NAMES.has(name)) ||
    (name != null && DELAY_STATUS_NAMES.has(name) && state !== "in");
  if (notPlayed) {
    return description?.trim() || shortDetail?.trim() || prettyStatusName(name!);
  }
  return liveStatusDetail(name, period, shortDetail, description);
}

/** Finite number or null (ESPN sometimes sends "" / "-" / garbage). */
function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function parseScore(value: unknown): number | undefined {
  const n = finiteOrNull(value);
  return n != null && n >= 0 ? Math.round(n) : undefined;
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

const PICKEM_DETAILS = /^\s*(EVEN|PK|PICK)/i;

export function extractOdds(oddsBlock: EspnOddsBlock | undefined): {
  spread: number | null;
  favoriteSide: "home" | "away" | null;
  oddsAway: number | null;
  oddsHome: number | null;
} {
  if (!oddsBlock) {
    return { spread: null, favoriteSide: null, oddsAway: null, oddsHome: null };
  }

  // ESPN's spread is from the home team's perspective: -5.5 = home favored, +2.5 = away favored.
  let rawSpread = finiteOrNull(oddsBlock.spread);
  if (rawSpread == null && oddsBlock.details && PICKEM_DETAILS.test(oddsBlock.details)) rawSpread = 0;

  let favoriteSide: "home" | "away" | null = null;
  if (oddsBlock.homeTeamOdds?.favorite) favoriteSide = "home";
  else if (oddsBlock.awayTeamOdds?.favorite) favoriteSide = "away";
  if (favoriteSide == null && rawSpread != null) {
    // Pick'em (0): home is the nominal favorite so picks are allowed and grading is straight-up.
    if (Math.abs(rawSpread) < 0.001) favoriteSide = "home";
    else favoriteSide = rawSpread < 0 ? "home" : "away";
  }

  return {
    spread: rawSpread != null ? Math.abs(rawSpread) : null,
    favoriteSide,
    oddsAway: extractSpreadJuice(oddsBlock.awayTeamOdds),
    oddsHome: extractSpreadJuice(oddsBlock.homeTeamOdds),
  };
}

async function fetchOddsFallback(eventId: string, competitionId: string): Promise<EspnOddsBlock | null> {
  try {
    const data = await fetchJson<{ items?: Array<EspnOddsBlock & { $ref?: string }> }>(
      `${ODDS_URL}/${eventId}/competitions/${competitionId}/odds`,
      "ESPN odds",
    );
    const item = data.items?.[0];
    if (!item) return null;
    // List payload often already includes full odds; prefer that over fragile $ref fetches.
    if (item.awayTeamOdds || item.homeTeamOdds || item.spread != null) {
      return item;
    }
    const ref = item.$ref?.replace(/^http:\/\//, "https://");
    if (!ref) return null;
    return await fetchJson<EspnOddsBlock>(ref, "ESPN odds detail");
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

/** Parse one ESPN event; returns null (skip) for malformed events instead of throwing. */
export function parseEvent(event: EspnEvent, oddsBlock?: EspnOddsBlock | null): GameData | null {
  const comp = event?.competitions?.[0];
  if (!event?.id || !comp || !Array.isArray(comp.competitors)) return null;

  const home = comp.competitors.find((c) => c?.homeAway === "home");
  const away = comp.competitors.find((c) => c?.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const kickoffAt = comp.date || event.date;
  if (!kickoffAt || !Number.isFinite(Date.parse(kickoffAt))) return null;

  const embeddedOdds = comp.odds?.[0];
  // Prefer the caller-supplied block (often the odds API with juice) over scoreboard embeds.
  const odds = extractOdds(oddsBlock ?? embeddedOdds ?? undefined);
  const seasonType = event.season?.type ?? 1;
  const weekNumber = event.week?.number ?? 1;
  const statusType = comp.status?.type;
  const statusName = statusType?.name;
  const period = finiteOrNull(comp.status?.period);
  const displayClock = comp.status?.displayClock ?? null;
  const status = mapStatus(statusName, statusType?.completed, statusType?.state);

  const game: GameData = {
    id: event.id,
    espnEventId: event.id,
    awayTeam: away.team.displayName,
    awayAbbrev: away.team.abbreviation ?? away.team.displayName,
    homeTeam: home.team.displayName,
    homeAbbrev: home.team.abbreviation ?? home.team.displayName,
    awayRecord: extractTeamRecord(away),
    homeRecord: extractTeamRecord(home),
    kickoffAt,
    spread: odds.spread,
    favoriteSide: odds.favoriteSide,
    oddsAway: odds.oddsAway,
    oddsHome: odds.oddsHome,
    atsResult: null,
    status,
    awayScore: parseScore(away.score),
    homeScore: parseScore(home.score),
    period,
    displayClock,
    statusDetail: statusDetailFor(
      statusName,
      statusType?.state,
      period,
      statusType?.shortDetail,
      statusType?.description,
    ),
    weekNumber,
    seasonType,
    phase: phaseFor(seasonType, weekNumber),
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

function needsOddsFallback(oddsBlock: EspnOddsBlock | undefined): boolean {
  if (!oddsBlock) return true;
  const embedded = extractOdds(oddsBlock);
  return (
    embedded.oddsAway == null ||
    embedded.oddsHome == null ||
    embedded.spread == null ||
    !embedded.favoriteSide
  );
}

async function buildBoard(
  data: EspnScoreboard,
  requestedSeasonType: number,
  requestedWeek: number,
  opts: ScoreboardOptions,
): Promise<ScoreboardResult> {
  const events = (data.events ?? []).filter((e) => e?.id && e.competitions?.[0]);
  const resolvedType = data.season?.type ?? requestedSeasonType;

  let skip = new Set<string>();
  if (opts.skipOddsFallback && events.length > 0) {
    skip = await opts.skipOddsFallback(
      events.map((e) => ({ eventId: e.id, kickoffAt: e.competitions![0]!.date || e.date })),
    );
  }

  const withFallback = opts.withOddsFallback !== false;
  const oddsBlocks = await mapWithConcurrency(events, ODDS_FALLBACK_CONCURRENCY, async (event) => {
    const comp = event.competitions![0]!;
    const embedded = comp.odds?.[0];
    if (!withFallback || skip.has(event.id) || !needsOddsFallback(embedded)) return embedded ?? null;
    return (await fetchOddsFallback(event.id, comp.id ?? event.id)) ?? embedded ?? null;
  });

  const games: GameData[] = [];
  events.forEach((event, i) => {
    try {
      const game = parseEvent(event, oddsBlocks[i]);
      if (game) games.push(game);
    } catch (err) {
      console.error(`ESPN event ${event.id} skipped:`, err);
    }
  });

  return {
    games: sortGamesLiveFirstThenChronological(games),
    seasonType: resolvedType,
    week: data.week?.number ?? requestedWeek,
    seasonYear: seasonYearFromScoreboard(data, resolvedType),
  };
}

export async function fetchScoreboard(
  seasonType = 1,
  week = 2,
  opts: ScoreboardOptions = {},
): Promise<ScoreboardResult> {
  const data = await fetchJson<EspnScoreboard>(
    `${SCOREBOARD_URL}?seasontype=${seasonType}&week=${week}`,
    "ESPN scoreboard",
  );
  return buildBoard(data, seasonType, week, opts);
}

/** ESPN's current slate — one scoreboard download (the default endpoint is the current week). */
export async function fetchCurrentScoreboard(opts: ScoreboardOptions = {}): Promise<ScoreboardResult> {
  const data = await fetchJson<EspnScoreboard>(SCOREBOARD_URL, "ESPN scoreboard");
  return buildBoard(data, data.season?.type ?? 2, data.week?.number ?? 1, opts);
}

/** Detect current NFL week from ESPN calendar (no week params). */
export async function detectCurrentWeek(): Promise<{
  seasonType: number;
  week: number;
  seasonYear: number;
}> {
  const data = await fetchJson<EspnScoreboard>(SCOREBOARD_URL, "ESPN scoreboard");
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
 * Status-only lookups — never fetches odds.
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
    const board = await fetchScoreboard(seasonType, week, { withOddsFallback: false });
    const games = board.games;
    const finished =
      games.length === 0 ||
      games.every((g) => g.status === "final" || /cancel|postpone/i.test(g.statusDetail ?? ""));
    if (!finished) {
      return { seasonType, week, seasonYear: current.seasonYear };
    }

    const next = nextAvailableWeek(seasonType, week);
    if (next.seasonType === seasonType && next.week === week) {
      return { seasonType, week, seasonYear: current.seasonYear };
    }

    const nextBoard = await fetchScoreboard(next.seasonType, next.week, { withOddsFallback: false });
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
