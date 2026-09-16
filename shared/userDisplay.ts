/** What everyone sees in the UI. Freeform — not forced into `username (nick)`. */
export function publicDisplayName(user: {
  username: string;
  displayName?: string | null;
}): string {
  const raw = user.displayName?.trim();
  if (!raw) return user.username;
  return raw;
}

const DISPLAY_NAME_MAX = 40;

/** Validate display name; empty clears it (UI falls back to username). */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) return null;
  if (name.length > DISPLAY_NAME_MAX) {
    throw new Error(`Display name must be at most ${DISPLAY_NAME_MAX} characters`);
  }
  return name;
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  const name = raw.trim();
  if (!USERNAME_PATTERN.test(name)) {
    throw new Error("Username must be 3-20 characters: letters, numbers, underscore");
  }
  return name;
}
