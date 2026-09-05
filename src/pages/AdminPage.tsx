import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import {
  apiAdminBan,
  apiAdminDeleteUser,
  apiAdminFactoryReset,
  apiAdminGet,
  apiAdminRegistration,
  apiAdminSetAdmin,
  apiAdminSetDisplayName,
  apiAdminUnban,
  apiSyncEspn,
  isDemoMode,
} from "../lib/api";
import { Navigate } from "react-router-dom";
import { nicknameFromStored, publicDisplayName } from "@shared/userDisplay";

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  isBanned: boolean;
  isAdmin: boolean;
};

export function AdminPage() {
  const { user, logout } = useAuth();
  const { seasonType, week } = useWeek();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const reloadUsers = async () => {
    const res = await apiAdminGet();
    setUsers(res.users);
    setRegistrationOpen(res.registrationOpen);
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

  if (isDemoMode() || !user?.isAdmin) {
    if (isDemoMode()) {
      return (
        <AppShell showWeekSelector={false}>
          <div className="mx-auto max-w-3xl rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
            <h2 className="font-display mb-3 text-3xl">Admin</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Admin tools need the Netlify API and database. Run with{" "}
              <span className="font-mono">npx netlify dev</span> and a{" "}
              <span className="font-mono">DATABASE_URL</span> to manage users and registration.
            </p>
          </div>
        </AppShell>
      );
    }
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
    setEditName(nicknameFromStored(u));
  };

  const saveDisplayName = async (userId: string) => {
    setSavingId(userId);
    setError("");
    try {
      await apiAdminSetDisplayName(userId, editName);
      const nick = editName.trim();
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                displayName: nick
                  ? publicDisplayName({ username: u.username, displayName: nick })
                  : u.username,
              }
            : u,
        ),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update display name");
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
        `Reset complete. Removed ${res.deletedUsers} users, ${res.deletedPicks} picks, ${res.deletedGames} games. Kept ${res.keptAdminUsername}. Synced ${res.synced.upserted} games for week ${res.synced.week}. Logging you out — sign in again as ${res.keptAdminUsername}.`,
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

        <div className="rounded-2xl border-2 border-[var(--accent-red)] bg-[var(--bg-card)] p-6">
          <div className="space-y-3">
            <div>
              <p className="font-bold text-[var(--accent-red)]">Factory reset</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Deletes all beta users (except you), all picks, and all preseason/season games.
                Re-opens registration and syncs the current ESPN week. This cannot be undone.
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
            Login username stays the same. Add a real name and everyone sees{" "}
            <span className="font-mono">pjhaber82 (Peter)</span>. Ban blocks login but keeps
            their picks; Delete removes the account and picks entirely.
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
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                        Real name / nickname
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={24}
                          placeholder="Peter"
                          className="min-h-11 min-w-[12rem] flex-1 rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-3 text-sm font-semibold"
                          aria-label={`Nickname for ${u.username}`}
                        />
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => saveDisplayName(u.id)}
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
                      <p className="text-sm text-[var(--text-muted)]">
                        Shows as:{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                          {publicDisplayName({
                            username: u.username,
                            displayName: editName.trim() || null,
                          })}
                        </span>
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
