import type { StoredPicks, UserPick } from "@shared/types";

const USERNAME_KEY = "pickems_username";
const PICKS_PREFIX = "pickems_picks_";

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setStoredUsername(username: string) {
  localStorage.setItem(USERNAME_KEY, username);
}

export function getStoredPicks(weekKey: string): Record<string, UserPick> {
  const raw = localStorage.getItem(`${PICKS_PREFIX}${weekKey}`);
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as StoredPicks;
    return data.picks ?? {};
  } catch {
    return {};
  }
}

export function saveStoredPicks(weekKey: string, username: string, picks: Record<string, UserPick>) {
  const payload: StoredPicks = {
    username,
    weekKey,
    picks,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(`${PICKS_PREFIX}${weekKey}`, JSON.stringify(payload));
}

export function updateStoredPick(
  weekKey: string,
  username: string,
  gameId: string,
  update: Partial<UserPick>,
) {
  const picks = getStoredPicks(weekKey);
  const existing = picks[gameId] ?? { gameId, pick: null, isConfidenceBet: false };
  picks[gameId] = { ...existing, ...update, gameId };
  saveStoredPicks(weekKey, username, picks);
  return picks;
}
