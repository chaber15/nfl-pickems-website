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

/** Primary brand color for lean bars / accents (readable on light + dark). */
const TEAM_COLORS: Record<string, string> = {
  ARI: "#97233F",
  ATL: "#A71930",
  BAL: "#241773",
  BUF: "#00338D",
  CAR: "#0085CA",
  CHI: "#0B162A",
  CIN: "#FB4F14",
  CLE: "#FF3C00",
  DAL: "#003594",
  DEN: "#FB4F14",
  DET: "#0076B6",
  GB: "#203731",
  HOU: "#03202F",
  IND: "#002C5F",
  JAX: "#006778",
  KC: "#E31837",
  LAC: "#0080C6",
  LAR: "#FFD100",
  LV: "#A5ACAF",
  MIA: "#008E97",
  MIN: "#4F2683",
  NE: "#002244",
  NO: "#D3BC8D",
  NYG: "#0B2265",
  NYJ: "#125740",
  PHI: "#004C54",
  PIT: "#FFB612",
  SF: "#AA0000",
  SEA: "#69BE28",
  TB: "#D50A0A",
  TEN: "#4B92DB",
  WSH: "#5A1414",
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

/** Hex primary for a team abbrev; muted gray if unknown. */
export function teamColor(abbrev: string | null | undefined): string {
  if (!abbrev) return "#5c6b7a";
  return TEAM_COLORS[resolveAbbrev(abbrev)] ?? "#5c6b7a";
}

export const NFL_LOGO_SRC = "/brand/nfltransparent.jpeg";
