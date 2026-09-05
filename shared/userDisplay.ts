/** Shown name: `username` or `username (Nickname)`. */
export function publicDisplayName(user: {
  username: string;
  displayName?: string | null;
}): string {
  const raw = user.displayName?.trim();
  if (!raw || raw.toLowerCase() === user.username.toLowerCase()) {
    return user.username;
  }
  // Already full format like "pjhaber82 (Peter)"
  if (raw.toLowerCase().startsWith(`${user.username.toLowerCase()} (`)) {
    return raw;
  }
  return `${user.username} (${raw})`;
}

/** Nickname part for the admin editor (empty = show username only). */
export function nicknameFromStored(user: {
  username: string;
  displayName?: string | null;
}): string {
  const raw = user.displayName?.trim() ?? "";
  if (!raw || raw.toLowerCase() === user.username.toLowerCase()) return "";
  const open = `${user.username} (`;
  if (raw.toLowerCase().startsWith(open.toLowerCase()) && raw.endsWith(")")) {
    return raw.slice(open.length, -1).trim();
  }
  return raw;
}

const NICKNAME_MAX = 24;

/** Validate admin-edited nickname; empty clears the display suffix. */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) return null;
  if (name.length > NICKNAME_MAX) {
    throw new Error(`Name must be at most ${NICKNAME_MAX} characters`);
  }
  return name;
}
