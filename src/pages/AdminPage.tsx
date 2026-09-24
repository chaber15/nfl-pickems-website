import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import {
  ApiError,
  apiAdminGet,
  apiAdminLock,
  errorMessage,
  type AdminData,
  type AdminTier,
  type AdminUserRow,
} from "../lib/api";
import { ErrorState } from "../components/ErrorState";
import { AdminUnlock } from "../components/admin/AdminUnlock";
import { AdminCard, makeAdminErrorHandler } from "../components/admin/adminShared";
import { SyncSection } from "../components/admin/SyncSection";
import { RegistrationSection } from "../components/admin/RegistrationSection";
import { UsersSection } from "../components/admin/UsersSection";
import { BadgeCatalogSection, BadgeRecalcSection } from "../components/admin/BadgeSections";
import { FactoryResetSection } from "../components/admin/FactoryResetSection";

type Status = "loading" | "locked" | "forbidden" | "error" | "ready";

export function AdminPage() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<Omit<AdminData, "users"> | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [showSuperUnlock, setShowSuperUnlock] = useState(false);
  const [locking, setLocking] = useState(false);
  const reqRef = useRef(0);
  const isAdmin = user?.isAdmin ?? false;

  const load = useCallback(async () => {
    const id = ++reqRef.current;
    try {
      const res = await apiAdminGet();
      if (id !== reqRef.current) return;
      const { users: rows, ...rest } = res;
      setUsers(rows);
      setData(rest);
      setStatus("ready");
    } catch (err) {
      if (id !== reqRef.current) return;
      if (err instanceof ApiError && err.code === "ADMIN_LOCKED") {
        setStatus("locked");
      } else if (err instanceof ApiError && (err.code === "FORBIDDEN" || err.status === 403)) {
        setStatus("forbidden");
      } else {
        setLoadError(errorMessage(err, "Failed to load admin data"));
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    return () => {
      reqRef.current++;
    };
  }, [isAdmin, load]);

  const onLocked = useCallback(() => {
    reqRef.current++;
    setStatus("locked");
  }, []);
  const onError = useMemo(() => makeAdminErrorHandler(onLocked), [onLocked]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const tier: AdminTier = data?.tier ?? "admin";

  const onUnlocked = () => {
    setShowSuperUnlock(false);
    setStatus("loading");
    void load();
  };

  const lockNow = async () => {
    setLocking(true);
    try {
      await apiAdminLock();
    } catch {
      /* the page locks locally either way */
    } finally {
      setLocking(false);
      onLocked();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl sm:text-4xl">Admin</h2>
        {status === "ready" && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                tier === "super"
                  ? "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
                  : "bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
              }`}
            >
              {tier === "super" ? "Super admin" : "Admin"}
            </span>
            <button
              type="button"
              onClick={() => void lockNow()}
              disabled={locking}
              className="min-h-11 rounded-2xl border-2 border-[var(--border-card)] px-4 text-sm font-bold disabled:opacity-60"
            >
              Lock admin
            </button>
          </div>
        )}
      </div>

      {status === "loading" && <p className="text-sm text-[var(--text-muted)]">Loading...</p>}

      {status === "locked" && <AdminUnlock onUnlocked={onUnlocked} />}

      {status === "forbidden" && (
        <ErrorState title="No admin access" message="This account can't use the admin tools." />
      )}

      {status === "error" && (
        <ErrorState
          title="Couldn't load admin data"
          message={loadError}
          onRetry={async () => {
            setStatus("loading");
            await load();
          }}
        />
      )}

      {status === "ready" && data && (
        <>
          {tier === "admin" && user?.isSuperAdmin && (
            <AdminCard>
              {showSuperUnlock ? (
                <AdminUnlock
                  compact
                  title="Unlock super admin"
                  description="Enter the super admin passphrase to manage admins and delete players."
                  submitLabel="Unlock super admin"
                  onUnlocked={onUnlocked}
                  onCancel={() => setShowSuperUnlock(false)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[var(--text-muted)]">
                    Some tools need the super admin passphrase.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSuperUnlock(true)}
                    className="min-h-11 rounded-2xl border-2 border-[var(--accent-gold)] px-4 text-sm font-bold text-[var(--accent-gold)]"
                  >
                    Unlock super admin
                  </button>
                </div>
              )}
            </AdminCard>
          )}

          <SyncSection onError={onError} />

          <RegistrationSection
            open={data.registrationOpen}
            onChange={(open) => setData((d) => (d ? { ...d, registrationOpen: open } : d))}
            onError={onError}
          />

          <UsersSection
            users={users}
            setUsers={setUsers}
            tier={tier}
            currentUserId={user?.id ?? null}
            onError={onError}
          />

          <BadgeCatalogSection rows={data.badgeCatalog ?? []} />

          <BadgeRecalcSection onDone={() => void load()} onError={onError} />

          {tier === "super" && data.factoryResetEnabled && (
            <FactoryResetSection onReset={logout} onError={onError} />
          )}
        </>
      )}
    </div>
  );
}
