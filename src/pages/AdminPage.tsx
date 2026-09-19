import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import {
  apiAdminBan,
  apiAdminDeleteUser,
  apiAdminFactoryReset,
  apiAdminGet,
  apiAdminRefreshBadges,
  apiAdminRegistration,
  apiAdminSetAdmin,
  apiAdminSetDisplayName,
  apiAdminSetUsername,
  apiAdminUnban,
  apiSyncEspn,
} from "../lib/api";
import { Navigate } from "react-router-dom";
import { publicDisplayName } from "@shared/userDisplay";
import {
  BADGE_RARITY_LABEL,
  badgeName,
  badgeRarity,
  badgeSoftClass,
  LIFETIME_THRESHOLD_BADGE_IDS,
} from "@shared/badges";
import type { BadgeRarity } from "@shared/badges";

const cumulativeBadgeLabel = LIFETIME_THRESHOLD_BADGE_IDS.map(badgeName).join(" / ");

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  isBanned: boolean;
  isAdmin: boolean;
};

type BadgeCatalogRow = {
  id: string;
  name: string;
  description: string;
  scope: string;
  rarity?: BadgeRarity;
  timesEarned: number;
};

function CatalogList({ rows }: { rows: BadgeCatalogRow[] }) {
  const ordered = [...rows].sort(
    (a, b) => (b.rarity ?? badgeRarity(b.id)) - (a.rarity ?? badgeRarity(a.id)) || a.name.localeCompare(b.name),
  );
  return (
    <ul className="mt-4 space-y-2">
      {ordered.map((b) => {
        const rarity = (b.rarity ?? badgeRarity(b.id)) as BadgeRarity;
        return (
          <li
            key={b.id}
            className={`rounded-xl border-2 px-3 py-2 text-sm ${
              b.timesEarned > 0
                ? badgeSoftClass(b.id)
                : "border-dashed border-[var(--border-card)] opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-bold">{b.name}</span>
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {BADGE_RARITY_LABEL[rarity]}
                {" · "}
                {b.timesEarned > 0 ? `×${b.timesEarned}` : "locked"}
              </span>
            </div>
            <p className="mt-0.5 text-[var(--text-muted)]">{b.description}</p>
          </li>
        );
      })}
      {ordered.length === 0 && (
        <li className="text-sm text-[var(--text-muted)]">No catalog loaded.</li>
      )}
    </ul>
  );
}

export function AdminPage() {
  const { user, logout } = useAuth();
  const { seasonType, week } = useWeek();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [badgeRefreshMsg, setBadgeRefreshMsg] = useState("");
  const [badgeRefreshing, setBadgeRefreshing] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeCatalogRow[]>([]);

  const reloadUsers = async () => {
    const res = await apiAdminGet();
    setUsers(res.users);
    setRegistrationOpen(res.registrationOpen);
    setBadgeCatalog(res.badgeCatalog ?? []);
  };

  useEffect(() => {
    if (!user?.isAdmin) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await reloadUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load admin data");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleBan = async (userId: string) => {
    setError("");
    try {
      await apiAdminBan(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBanned: true } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ban failed");
    }
  };

  const handleUnban = async (userId: string) => {
    setError("");
    try {
      await apiAdminUnban(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBanned: false } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unban failed");
    }
  };

  const handleDelete = async (u: AdminUser) => {
    const label = publicDisplayName(u);
    if (
      !window.confirm(
        `Delete ${label}? This permanently removes their account and all picks. They can sign up again if registration is open.`,
      )
    ) {
      return;
    }
    setSavingId(u.id);
    setError("");
    try {
      await apiAdminDeleteUser(u.id);
      setUsers((prev) => prev.filter((row) => row.id !== u.id));
      if (editingId === u.id) setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleAdmin = async (u: AdminUser) => {
    setSavingId(u.id);
    setError("");
    try {
      await apiAdminSetAdmin(u.id, !u.isAdmin);
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, isAdmin: !u.isAdmin } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update admin");
    } finally {
      setSavingId(null);
    }
  };

  const startEditName = (u: AdminUser) => {
    setEditingId(u.id);
    setEditName(publicDisplayName(u));
    setEditUsername(u.username);
  };

  const saveNames = async (userId: string) => {
    setSavingId(userId);
    setError("");
    try {
      const current = users.find((u) => u.id === userId);
      let nextUsername = current?.username ?? "";
      let nextDisplay = current?.displayName ?? "";

      if (editUsername.trim() !== current?.username) {
        const res = await apiAdminSetUsername(userId, editUsername);
        nextUsername = res.user.username;
        nextDisplay = res.user.displayName;
      }

      if (editName.trim() !== publicDisplayName({ username: nextUsername, displayName: nextDisplay })) {
        const res = await apiAdminSetDisplayName(userId, editName);
        nextDisplay = res.displayName;
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                username: nextUsername,
                displayName: nextDisplay,
              }
            : u,
        ),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSavingId(null);
    }
  };

  const toggleRegistration = async () => {
    const next = !registrationOpen;
    await apiAdminRegistration(next);
    setRegistrationOpen(next);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await apiSyncEspn(seasonType, week);
      setSyncMsg(`Synced ${res.upserted} games for the selected week.`);
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const formatBadgeRefreshMsg = (res: Awaited<ReturnType<typeof apiAdminRefreshBadges>>) => {
    const parts = res.weeks.map((w) => {
      if (w.status === "skipped_incomplete") {
        return `S${w.seasonType} W${w.week}: skipped (week not fully final)`;
      }
      if (w.status === "skipped_empty") {
        return `S${w.seasonType} W${w.week}: skipped (no games)`;
      }
      return `S${w.seasonType} W${w.week}: +${w.awarded} award(s)`;
    });
    const fullWipe =
      res.wiped != null ? ` Cleared ${res.wiped} existing badge(s), then recalculated.` : "";
    const life = res.lifetime
      ? ` Cumulative wipe: removed ${res.lifetime.removed}, left ${res.lifetime.remainingAfterWipe ?? "?"}, granted ${res.lifetime.granted}.`
      : "";
    const weekPart = parts.length ? ` ${parts.join(" · ")}` : "";
    return `Done — ${res.totalAwarded} award(s).${fullWipe}${life}${weekPart}`;
  };

  const handleResetAndRecalculateBadges = async () => {
    if (
      !window.confirm(
        `Delete ALL badges, then recalculate every fully final week from scratch (including ${cumulativeBadgeLabel} career thresholds)?`,
      )
    ) {
      return;
    }
    setBadgeRefreshing(true);
    setBadgeRefreshMsg("");
    setError("");
    try {
      const res = await apiAdminRefreshBadges({ allCompleted: true });
      setBadgeRefreshMsg(formatBadgeRefreshMsg(res));
      await reloadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Badge recalculate failed");
    } finally {
      setBadgeRefreshing(false);
    }
  };

  const handleFactoryReset = async () => {
    if (resetConfirm !== "RESET") {
      setError('Type RESET in the box to confirm');
      return;
    }
    setResetting(true);
    setError("");
    setResetMsg("");
    try {
      const res = await apiAdminFactoryReset("RESET");
      setResetMsg(
        `Reset complete. Removed ${res.deletedUsers} users, ${res.deletedPicks} picks, ${res.deletedGames} non-preseason games. Kept ${res.keptPreseasonGames ?? 0} preseason games and ${res.keptAdminUsername}. Synced ${res.synced.upserted} games for week ${res.synced.week}. Logging you out — sign in again as ${res.keptAdminUsername}.`,
      );
      setResetConfirm("");
      setUsers([]);
      setRegistrationOpen(true);
      // Session was wiped server-side; clear ghost local login
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Factory reset failed");
    } finally {
      setResetting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <h2 className="font-display text-3xl sm:text-4xl">Admin</h2>

        {error && (
          <p className="rounded-2xl border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-4 py-3 text-sm text-[var(--accent-red)]">
            {error}
          </p>
        )}

        <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-bold">ESPN sync</p>
              <p className="text-sm text-[var(--text-muted)]">
                Pull games, spreads, and grade finals for the selected week.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="min-h-11 rounded-2xl bg-[var(--accent-green)] px-4 font-bold text-[var(--accent-on-green)] disabled:opacity-60"
            >
              {syncing ? "Syncing..." : "Sync now"}
            </button>
          </div>
          {syncMsg && <p className="mt-3 text-sm font-semibold">{syncMsg}</p>}
        </div>

        <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-bold">Registration</p>
              <p className="text-sm text-[var(--text-muted)]">
                {registrationOpen ? "New players can sign up" : "Signups are locked"}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleRegistration}
              className="min-h-11 rounded-2xl border-2 border-[var(--accent-green)] px-4 font-bold text-[var(--accent-green)]"
            >
              {registrationOpen ? "Lock registration" : "Open registration"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6">
          <h3 className="mb-4 font-bold">Users</h3>
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Set a freeform <span className="font-semibold">display name</span> (what everyone sees)
            and/or change their login username if it isn’t taken. Ban blocks login but keeps their
            picks; Delete removes the account and picks entirely.
          </p>
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No other users yet.</p>
          ) : (
            <ul className="space-y-4">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="space-y-3 rounded-xl bg-[var(--bg-page)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{publicDisplayName(u)}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        login: <span className="font-mono">{u.username}</span>
                        {u.isAdmin && (
                          <span className="ml-2 font-bold text-[var(--accent-green)]">Admin</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditName(u)}
                        className="rounded-xl border-2 border-[var(--border-card)] px-3 py-1 text-sm font-bold"
                      >
                        Edit name
                      </button>
                      <button
                        type="button"
                        disabled={savingId === u.id}
                        onClick={() => handleToggleAdmin(u)}
                        className="rounded-xl border-2 border-[var(--accent-green)] px-3 py-1 text-sm font-bold text-[var(--accent-green)] disabled:opacity-60"
                      >
                        {u.isAdmin ? "Remove admin" : "Make admin"}
                      </button>
                      {u.isBanned ? (
                        <button
                          type="button"
                          onClick={() => handleUnban(u.id)}
                          className="rounded-xl border-2 border-[var(--accent-green)] px-3 py-1 text-sm font-bold text-[var(--accent-green)]"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBan(u.id)}
                          className="rounded-xl border-2 border-[var(--accent-red)] px-3 py-1 text-sm font-bold text-[var(--accent-red)]"
                        >
                          Ban
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={savingId === u.id}
                        onClick={() => handleDelete(u)}
                        className="rounded-xl border-2 border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-3 py-1 text-sm font-bold text-[var(--accent-red)] disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingId === u.id && (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Login username
                        </span>
                        <input
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          maxLength={20}
                          placeholder="pjhaber82"
                          className="min-h-11 w-full rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-3 text-sm font-semibold"
                          aria-label={`Login username for ${u.username}`}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Display name
                        </span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={40}
                          placeholder="Peter"
                          className="min-h-11 w-full rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-3 text-sm font-semibold"
                          aria-label={`Display name for ${u.username}`}
                        />
                      </label>
                      <p className="text-sm text-[var(--text-muted)]">
                        Shows as:{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                          {editName.trim() || editUsername.trim() || u.username}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => saveNames(u.id)}
                          className="min-h-11 rounded-xl bg-[var(--accent-green)] px-4 text-sm font-bold text-[var(--accent-on-green)] disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="min-h-11 rounded-xl border-2 border-[var(--border-card)] px-4 text-sm font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6">
          <p className="font-bold">Badge catalog</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            All possible badges, rarest first. Locked rows have never been earned. Players only see
            badges they have earned.
          </p>
          <CatalogList rows={badgeCatalog} />
        </div>

        <div className="rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-6">
          <div className="space-y-4">
            <div>
              <p className="font-bold">Recalculate badges</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Only needed if something looks wrong — badges award themselves as weeks go final.
                Deletes every badge, then recomputes all fully final weeks in order from stored picks
                and finals. Cumulative badges ({cumulativeBadgeLabel}) are re-granted from career
                totals.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetAndRecalculateBadges}
              disabled={badgeRefreshing}
              className="min-h-11 rounded-2xl bg-[var(--accent-blue)] px-4 font-bold text-white disabled:opacity-60"
            >
              {badgeRefreshing ? "Recalculating..." : "Reset & recalculate badges"}
            </button>
            {badgeRefreshMsg && <p className="text-sm font-semibold">{badgeRefreshMsg}</p>}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[var(--accent-red)] bg-[var(--bg-card)] p-6">
          <div className="space-y-3">
            <div>
              <p className="font-bold text-[var(--accent-red)]">Factory reset</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Deletes all other users, all picks, and all non-preseason weeks/games. Keeps preseason
                data and your admin account. Re-opens registration and syncs the current ESPN week.
              </p>
            </div>
            <label className="block space-y-2 text-sm font-semibold">
              <span>Type RESET to confirm</span>
              <input
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                className="min-h-11 w-full max-w-xs rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-page)] px-3 font-mono"
                placeholder="RESET"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              onClick={handleFactoryReset}
              disabled={resetting || resetConfirm !== "RESET"}
              className="min-h-11 rounded-2xl bg-[var(--accent-red)] px-4 font-bold text-white disabled:opacity-60"
            >
              {resetting ? "Resetting..." : "Wipe beta data"}
            </button>
            {resetMsg && <p className="text-sm font-semibold text-[var(--accent-green)]">{resetMsg}</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
