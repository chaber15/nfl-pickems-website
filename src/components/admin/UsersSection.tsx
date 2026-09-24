import { useState, type Dispatch, type SetStateAction } from "react";
import { publicDisplayName } from "@shared/userDisplay";
import {
  apiAdminBan,
  apiAdminDeleteUser,
  apiAdminSetAdmin,
  apiAdminSetDisplayName,
  apiAdminSetUsername,
  apiAdminUnban,
  type AdminTier,
  type AdminUserRow,
} from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { ADMIN_BTN, AdminCard, SectionError, type AdminErrorHandler } from "./adminShared";

type Props = {
  users: AdminUserRow[];
  setUsers: Dispatch<SetStateAction<AdminUserRow[]>>;
  tier: AdminTier;
  currentUserId: string | null;
  onError: AdminErrorHandler;
};

export function UsersSection({ users, setUsers, tier, currentUserId, onError }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const isSuper = tier === "super";
  /** Regular admins can't act on super admins. */
  const canManage = (u: AdminUserRow) => isSuper || !u.isSuperAdmin;

  const patchUser = (id: string, patch: Partial<AdminUserRow>) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const run = async (u: AdminUserRow, fallback: string, fn: () => Promise<void>) => {
    setBusyId(u.id);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(`${publicDisplayName(u)}: ${onError(err, fallback)}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleBan = (u: AdminUserRow) => {
    if (
      !confirmAction(
        `Ban ${publicDisplayName(u)}? They won't be able to sign in. Their picks are kept, and you can unban them later.`,
      )
    ) {
      return;
    }
    void run(u, "Ban failed", async () => {
      await apiAdminBan(u.id);
      patchUser(u.id, { isBanned: true });
    });
  };

  const handleUnban = (u: AdminUserRow) =>
    void run(u, "Unban failed", async () => {
      await apiAdminUnban(u.id);
      patchUser(u.id, { isBanned: false });
    });

  const handleDelete = (u: AdminUserRow) => {
    if (
      !confirmAction(
        `Delete ${publicDisplayName(u)}? This permanently removes their account and all their picks. This can't be undone.`,
      )
    ) {
      return;
    }
    void run(u, "Delete failed", async () => {
      await apiAdminDeleteUser(u.id);
      setUsers((prev) => prev.filter((row) => row.id !== u.id));
      if (editingId === u.id) setEditingId(null);
    });
  };

  const handleToggleAdmin = (u: AdminUserRow) => {
    const next = !u.isAdmin;
    if (
      !confirmAction(
        next
          ? `Make ${publicDisplayName(u)} an admin? They'll still need the admin passphrase to use these tools.`
          : `Remove admin from ${publicDisplayName(u)}?`,
      )
    ) {
      return;
    }
    void run(u, "Failed to update admin", async () => {
      await apiAdminSetAdmin(u.id, next);
      patchUser(u.id, { isAdmin: next });
    });
  };

  const startEdit = (u: AdminUserRow) => {
    setEditingId(u.id);
    setEditName(publicDisplayName(u));
    setEditUsername(u.username);
    setEditError("");
  };

  /** Username and display name save separately; a partial failure keeps what did save. */
  const saveNames = async (u: AdminUserRow) => {
    setBusyId(u.id);
    setEditError("");
    let nextUsername = u.username;
    let nextDisplay = u.displayName;
    let usernameSaved = false;
    try {
      if (editUsername.trim() !== u.username) {
        const res = await apiAdminSetUsername(u.id, editUsername.trim());
        nextUsername = res.user.username;
        nextDisplay = res.user.displayName;
        usernameSaved = true;
        patchUser(u.id, { username: nextUsername, displayName: nextDisplay });
      }
      if (editName.trim() !== publicDisplayName({ username: nextUsername, displayName: nextDisplay })) {
        const res = await apiAdminSetDisplayName(u.id, editName);
        nextDisplay = res.displayName;
        patchUser(u.id, { displayName: nextDisplay });
      }
      setEditingId(null);
    } catch (err) {
      const msg = onError(err, "Failed to update name");
      setEditError(
        usernameSaved ? `Login username saved as “${nextUsername}”, but the display name failed: ${msg}` : msg,
      );
      if (usernameSaved) setEditUsername(nextUsername);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminCard>
      <h3 className="mb-4 font-bold">Users</h3>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Set a freeform <span className="font-semibold">display name</span> (what everyone sees) and/or change
        their login username if it isn’t taken. Ban blocks login but keeps their picks
        {isSuper ? "; Delete removes the account and picks entirely." : "."}
      </p>
      <SectionError message={error} />
      {users.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No other users yet.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {users.map((u) => {
            const busy = busyId === u.id;
            const manage = canManage(u);
            const isSelf = u.id === currentUserId;
            return (
              <li key={u.id} className="space-y-3 rounded-xl bg-[var(--bg-page)] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {publicDisplayName(u)}
                      {isSelf && <span className="ml-2 text-xs text-[var(--text-muted)]">(you)</span>}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      login: <span className="font-mono">{u.username}</span>
                      {u.isSuperAdmin ? (
                        <span className="ml-2 font-bold text-[var(--accent-gold)]">Super admin</span>
                      ) : (
                        u.isAdmin && <span className="ml-2 font-bold text-[var(--accent-green)]">Admin</span>
                      )}
                      {u.isBanned && <span className="ml-2 font-bold text-[var(--accent-red)]">Banned</span>}
                    </p>
                  </div>
                  {manage && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(u)}
                        className={`${ADMIN_BTN} border-[var(--border-card)]`}
                      >
                        Edit name
                      </button>
                      {isSuper && !isSelf && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleAdmin(u)}
                          className={`${ADMIN_BTN} border-[var(--accent-green)] text-[var(--accent-green)]`}
                        >
                          {u.isAdmin ? "Remove admin" : "Make admin"}
                        </button>
                      )}
                      {!isSelf &&
                        (u.isBanned ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleUnban(u)}
                            className={`${ADMIN_BTN} border-[var(--accent-green)] text-[var(--accent-green)]`}
                          >
                            Unban
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleBan(u)}
                            className={`${ADMIN_BTN} border-[var(--accent-red)] text-[var(--accent-red)]`}
                          >
                            Ban
                          </button>
                        ))}
                      {isSuper && !isSelf && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDelete(u)}
                          className={`${ADMIN_BTN} border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-[var(--accent-red)]`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
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
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
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
                    {editError && (
                      <p role="alert" className="text-sm font-semibold text-[var(--accent-red)]">
                        {editError}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveNames(u)}
                        className="min-h-11 rounded-xl bg-[var(--accent-green)] px-4 text-sm font-bold text-[var(--accent-on-green)] disabled:opacity-60"
                      >
                        {busy ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="min-h-11 rounded-xl border-2 border-[var(--border-card)] px-4 text-sm font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminCard>
  );
}
