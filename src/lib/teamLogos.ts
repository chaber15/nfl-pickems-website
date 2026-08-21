/** ESPN abbrev → team logo under /team-logos */
const ALIASES: Record<string, string> = {
  WAS: "WSH",
  WFT: "WSH",
  JAC: "JAX",
  LA: "LAR",
  OAK: "LV",
  SD: "LAC",
};

export function teamLogoSrc(abbrev: string | null | undefined): string | null {
  if (!abbrev) return null;
  const key = ALIASES[abbrev.toUpperCase()] ?? abbrev.toUpperCase();
  return `/team-logos/${key}.webp`;
}

export const NFL_LOGO_SRC = "/brand/nfl-logo.webp";
