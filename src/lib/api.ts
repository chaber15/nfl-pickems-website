import type { GameData, LeaderboardEntry, UserStats, HistoryRow } from "@shared/types";

const API_BASE = "/api";

/** True when running Vite-only dev without Netlify/backend (localStorage demo). */
export function isDemoMode(): boolean {
  if (import.meta.env.VITE_USE_BACKEND === "true") return false;
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  return import.meta.env.DEV;
}

export function isApiAvailable(): boolean {
  return !isDemoMode();
}

export class ApiUnavailableError extends Error {
  constructor() {
    super("API unavailable in demo mode");
    this.name = "ApiUnavailableError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (isDemoMode()) {
    throw new ApiUnavailableError();
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface AuthUser {
  id: string;
  username: string;
  isAdmin: boolean;
}

export async function apiMe(): Promise<{ user: AuthUser | null }> {
  return request("/auth/me");
}

export async function apiLogin(username: string): Promise<{ user: AuthUser; created: boolean }> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ username }) });
}

export async function apiLogout(): Promise<void> {
  await request("/auth/logout", { method: "POST" });
}

export async function apiGames(seasonType: number, week: number): Promise<{ games: GameData[]; source: string }> {
  return request(`/games?seasonType=${seasonType}&week=${week}`);
}

export async function apiUserPicks(seasonType: number, week: number): Promise<{ picks: Record<string, { pick: string; isConfidenceBet: boolean }> }> {
  return request(`/picks?seasonType=${seasonType}&week=${week}`);
}

export async function apiSavePick(body: {
  gameId: string;
  pick?: "favorite" | "underdog";
  action?: "toggle_confidence";
}): Promise<void> {
  await request("/picks", { method: "POST", body: JSON.stringify(body) });
}

export async function apiLeaderboard(): Promise<{ entries: LeaderboardEntry[] }> {
  return request("/leaderboard");
}

export async function apiHistory(
  seasonType?: number,
  week?: number,
): Promise<{ history: HistoryRow[] }> {
  const params = new URLSearchParams();
  if (seasonType != null) params.set("seasonType", String(seasonType));
  if (week != null) params.set("week", String(week));
  const qs = params.toString();
  return request(`/history${qs ? `?${qs}` : ""}`);
}

export async function apiStats(): Promise<{ stats: UserStats }> {
  return request("/stats");
}

export async function apiCurrentWeek(): Promise<{ seasonType: number; week: number }> {
  return request("/calendar/current");
}

export async function apiSyncEspn(seasonType?: number, week?: number): Promise<{ upserted: number }> {
  return request("/admin/sync", {
    method: "POST",
    body: JSON.stringify({ seasonType, week }),
  });
}

export async function apiAdminGet(): Promise<{ users: Array<{ id: string; username: string; isBanned: boolean }>; registrationOpen: boolean }> {
  return request("/admin");
}

export async function apiAdminBan(userId: string): Promise<void> {
  await request("/admin", { method: "POST", body: JSON.stringify({ action: "ban", userId }) });
}

export async function apiAdminRegistration(open: boolean): Promise<void> {
  await request("/admin", { method: "POST", body: JSON.stringify({ action: "registration", registrationOpen: open }) });
}
