/** ESPN abbrev → team logo under /team-logos */
const ALIASES: Record<string, string> = {
  WAS: "WSH",
  WFT: "WSH",
  JAC: "JAX",
  LA: "LAR",
  OAK: "LV",
  SD: "LAC",
};

/** Location / market name (not mascot) for bet UI */
const LOCATIONS: Record<string, string> = {
  ARI: "Arizona",
  ATL: "Atlanta",
  BAL: "Baltimore",
  BUF: "Buffalo",
  CAR: "Carolina",
  CHI: "Chicago",
  CIN: "Cincinnati",
  CLE: "Cleveland",
  DAL: "Dallas",
  DEN: "Denver",
  DET: "Detroit",
  GB: "Green Bay",
  HOU: "Houston",
  IND: "Indianapolis",
  JAX: "Jacksonville",
  KC: "Kansas City",
  LAC: "Los Angeles",
  LAR: "Los Angeles",
  LV: "Las Vegas",
  MIA: "Miami",
  MIN: "Minnesota",
  NE: "New England",
  NO: "New Orleans",
  NYG: "New York",
  NYJ: "New York",
  PHI: "Philadelphia",
  PIT: "Pittsburgh",
  SF: "San Francisco",
  SEA: "Seattle",
  TB: "Tampa Bay",
  TEN: "Tennessee",
  WSH: "Washington",
};

function resolveAbbrev(abbrev: string): string {
  const upper = abbrev.toUpperCase();
  return ALIASES[upper] ?? upper;
}

export function teamLogoSrc(abbrev: string | null | undefined): string | null {
  if (!abbrev) return null;
  return `/team-logos/${resolveAbbrev(abbrev)}.webp`;
}

/** Short location label for pick buttons, e.g. Baltimore / Tennessee */
export function teamLocationName(abbrev: string | null | undefined, fallback = "TBD"): string {
  if (!abbrev) return fallback;
  const key = resolveAbbrev(abbrev);
  return LOCATIONS[key] ?? fallback;
}

export const NFL_LOGO_SRC = "/brand/nfl-logo.webp";
