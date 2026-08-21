import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../lib/authContext";
import { useWeek } from "../lib/weekContext";
import { apiAdminBan, apiAdminGet, apiAdminRegistration, apiSyncEspn, isDemoMode } from "../lib/api";
import { Navigate } from "react-router-dom";

export function AdminPage() {
  const { user } = useAuth();
  const { seasonType, week } = useWeek();
  const [users, setUsers] = useState<Array<{ id: string; username: string; isBanned: boolean }>>([]);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user?.isAdmin) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await apiAdminGet();
        setUsers(res.users);
        setRegistrationOpen(res.registrationOpen);
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
    await apiAdminBan(userId);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBanned: true } : u)));
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
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No other users yet.</p>
          ) : (
            <ul className="space-y-3">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-4 rounded-xl bg-[var(--bg-page)] px-4 py-3"
                >
                  <span className="font-semibold">{u.username}</span>
                  {u.isBanned ? (
                    <span className="text-sm font-bold text-[var(--accent-red)]">Banned</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBan(u.id)}
                      className="rounded-xl border-2 border-[var(--accent-red)] px-3 py-1 text-sm font-bold text-[var(--accent-red)]"
                    >
                      Ban
                    </button>
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
