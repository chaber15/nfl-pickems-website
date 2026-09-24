import type {
  EarnedBadge,
  GameData,
  LeaderboardEntry,
  PickSide,
  UserStats,
  HistoryRow,
  WeekCompareResponse,
} from "@shared/types";
import type { BadgeRarity } from "@shared/badges";

const API_BASE = "/api";
const TIMEOUT_MS = 10_000;

export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";
const TIMEOUT_MESSAGE = "The server took too long to answer. Please try again.";

/** Error from the API (or from failing to reach it). `status` is 0 when no HTTP response arrived. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

let unauthorizedHandler: (() => void) | null = null;

/** Called when a non-auth endpoint answers 401 (session expired). Auth context re-checks /auth/me. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return "Not found.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  return `Request failed (${status})`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const outer = init.signal ?? null;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch {
      if (outer?.aborted) throw new ApiError("Request cancelled", 0, "ABORTED");
      if (timedOut) throw new ApiError(TIMEOUT_MESSAGE, 0, "TIMEOUT");
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0, "NETWORK");
    }

    if (res.status === 204) return undefined as T;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      // e.g. an HTML fallback page or a plain-text gateway error — not our API.
      throw new ApiError(
        res.ok || res.status >= 500 ? NETWORK_ERROR_MESSAGE : fallbackMessage(res.status),
        res.status,
        "BAD_RESPONSE",
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (outer?.aborted) throw new ApiError("Request cancelled", 0, "ABORTED");
      if (timedOut) throw new ApiError(TIMEOUT_MESSAGE, 0, "TIMEOUT");
      throw new ApiError(NETWORK_ERROR_MESSAGE, res.status, "BAD_RESPONSE");
    }

    if (!res.ok) {
      const errBody = (body ?? {}) as { error?: unknown; code?: unknown };
      const message =
        typeof errBody.error === "string" && errBody.error.trim()
          ? errBody.error
          : fallbackMessage(res.status);
      const code = typeof errBody.code === "string" ? errBody.code : undefined;
      if (res.status === 401 && !path.startsWith("/auth/")) unauthorizedHandler?.();
      throw new ApiError(message, res.status, code);
    }

    return body as T;
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

/* ───────────── Auth ───────────── */

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
}

export async function apiMe(): Promise<{ user: AuthUser | null }> {
  return request("/auth/me");
}

/** Without `create`, an unknown name fails with 404 USER_NOT_FOUND so typos don't make new players. */
export async function apiLogin(
  username: string,
  create = false,
): Promise<{ user: AuthUser; created: boolean }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(create ? { username, create: true } : { username }),
  });
}

export async function apiLogout(): Promise<void> {
  await request("/auth/logout", { method: "POST" });
}

export async function apiChangeUsername(username: string): Promise<{ user: AuthUser }> {
  return request("/auth/username", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

/* ───────────── Games & picks ───────────── */

export async function apiGames(
  seasonType: number,
  week: number,
  signal?: AbortSignal,
): Promise<{ games: GameData[]; source: string }> {
  return request(`/games?seasonType=${seasonType}&week=${week}`, { signal });
}

export async function apiUserPicks(
  seasonType: number,
  week: number,
  signal?: AbortSignal,
): Promise<{ picks: Record<string, { pick: string; isConfidenceBet: boolean }> }> {
  return request(`/picks?seasonType=${seasonType}&week=${week}`, { signal });
}

export async function apiWeekPicks(
  seasonType: number,
  week: number,
  signal?: AbortSignal,
): Promise<WeekCompareResponse> {
  return request(`/picks/week?seasonType=${seasonType}&week=${week}`, { signal });
}

export type SavedPick = { pick: PickSide | null; isConfidenceBet: boolean };

export type SavePickBody =
  | { gameId: string; pick: PickSide }
  | { gameId: string; action: "set_confidence"; value: boolean };

/** Saves a side or sets ★ explicitly (idempotent). Resolves with the stored pick when the server returns it. */
export async function apiSavePick(body: SavePickBody): Promise<SavedPick | null> {
  const res = await request<{ pick?: { pick?: string | null; isConfidenceBet?: boolean } } | undefined>(
    "/picks",
    { method: "POST", body: JSON.stringify(body) },
  );
  const p = res?.pick;
  if (!p || typeof p.isConfidenceBet !== "boolean") return null;
  const side = p.pick === "favorite" || p.pick === "underdog" ? p.pick : null;
  return { pick: side, isConfidenceBet: p.isConfidenceBet };
}

/* ───────────── Standings ───────────── */

export async function apiLeaderboard(
  seasonType?: number,
  week?: number,
): Promise<{ entries: LeaderboardEntry[] }> {
  const params = new URLSearchParams();
  if (seasonType != null) params.set("seasonType", String(seasonType));
  if (week != null) params.set("week", String(week));
  const qs = params.toString();
  return request(`/leaderboard${qs ? `?${qs}` : ""}`);
}

export async function apiHistory(
  seasonType?: number,
  week?: number,
  username?: string,
): Promise<{ history: HistoryRow[]; username?: string; displayName?: string }> {
  const params = new URLSearchParams();
  if (seasonType != null) params.set("seasonType", String(seasonType));
  if (week != null) params.set("week", String(week));
  if (username) params.set("username", username);
  const qs = params.toString();
  return request(`/history${qs ? `?${qs}` : ""}`);
}

export async function apiStats(username?: string): Promise<{
  stats: UserStats;
  username?: string;
  displayName?: string;
  badges?: EarnedBadge[];
}> {
  const params = new URLSearchParams();
  if (username) params.set("username", username);
  const qs = params.toString();
  return request(`/stats${qs ? `?${qs}` : ""}`);
}

/* ───────────── Admin ───────────── */

export type AdminTier = "admin" | "super";

export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  isBanned: boolean;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
}

export interface BadgeCatalogRow {
  id: string;
  name: string;
  description: string;
  scope: string;
  rarity?: BadgeRarity;
  timesEarned: number;
}

export interface AdminData {
  users: AdminUserRow[];
  registrationOpen: boolean;
  tier?: AdminTier;
  factoryResetEnabled?: boolean;
  badgeCatalog?: BadgeCatalogRow[];
}

/** Unlock admin tools with the passphrase. The super passphrase yields tier "super". */
export async function apiAdminUnlock(pin: string): Promise<{ tier: AdminTier }> {
  return request("/admin/unlock", { method: "POST", body: JSON.stringify({ pin }) });
}

export async function apiAdminLock(): Promise<void> {
  await request("/admin/lock", { method: "POST" });
}

export async function apiAdminGet(): Promise<AdminData> {
  return request("/admin");
}

export async function apiSyncEspn(seasonType?: number, week?: number): Promise<{ upserted: number }> {
  return request("/admin/sync", {
    method: "POST",
    body: JSON.stringify({ seasonType, week }),
  });
}

export interface BadgeRefreshResult {
  weeks: Array<{
    seasonType: number;
    week: number;
    awarded: number;
    status: "ok" | "skipped_empty" | "skipped_incomplete";
  }>;
  totalAwarded: number;
  wiped?: number;
  lifetime?: {
    removed: number;
    granted: number;
    countsByUser: number;
    remainingAfterWipe?: number;
  };
}

export async function apiAdminRefreshBadges(opts: {
  seasonType?: number;
  week?: number;
  allCompleted?: boolean;
  reconcileOnly?: boolean;
}): Promise<BadgeRefreshResult> {
  return request("/admin/badges", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

async function adminAction<T = unknown>(body: Record<string, unknown>): Promise<T> {
  return request("/admin", { method: "POST", body: JSON.stringify(body) });
}

export async function apiAdminBan(userId: string): Promise<void> {
  await adminAction({ action: "ban", userId });
}

export async function apiAdminUnban(userId: string): Promise<void> {
  await adminAction({ action: "unban", userId });
}

export async function apiAdminDeleteUser(userId: string): Promise<void> {
  await adminAction({ action: "delete", userId });
}

export async function apiAdminSetAdmin(userId: string, isAdmin: boolean): Promise<void> {
  await adminAction({ action: "set_admin", userId, isAdmin });
}

export async function apiAdminSetDisplayName(
  userId: string,
  displayName: string,
): Promise<{ displayName: string }> {
  return adminAction({ action: "set_display_name", userId, displayName });
}

export async function apiAdminSetUsername(userId: string, username: string): Promise<{ user: AuthUser }> {
  return adminAction({ action: "set_username", userId, username });
}

export async function apiAdminRegistration(open: boolean): Promise<void> {
  await adminAction({ action: "registration", registrationOpen: open });
}

export async function apiAdminFactoryReset(confirm: string): Promise<{
  deletedUsers: number;
  deletedPicks: number;
  deletedGames: number;
  deletedWeeks: number;
  deletedSeasons: number;
  keptAdminUsername: string;
  keptPreseasonGames?: number;
  synced: { upserted: number; week: number; seasonType: number };
}> {
  return request("/admin/reset", {
    method: "POST",
    body: JSON.stringify({ confirm }),
  });
}
