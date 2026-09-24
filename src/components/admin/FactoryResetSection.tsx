import { useState } from "react";
import { apiAdminFactoryReset } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { AdminCard, SectionError, SectionSuccess, type AdminErrorHandler } from "./adminShared";

/** Super-admin only, and only rendered when the server has factory reset enabled. */
export function FactoryResetSection({
  onReset,
  onError,
}: {
  onReset: () => Promise<void>;
  onError: AdminErrorHandler;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const reset = async () => {
    if (confirmText !== "RESET") {
      setError("Type RESET in the box to confirm");
      return;
    }
    if (
      !confirmAction(
        "Really factory reset? This deletes every other player and ALL picks for the season. It cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await apiAdminFactoryReset("RESET");
      setMsg(
        `Reset complete. Removed ${res.deletedUsers} users, ${res.deletedPicks} picks, ${res.deletedGames} games. Kept ${res.keptAdminUsername}. Synced ${res.synced.upserted} games for week ${res.synced.week}. Signing you out — sign in again as ${res.keptAdminUsername}.`,
      );
      setConfirmText("");
      await onReset();
    } catch (err) {
      setError(onError(err, "Factory reset failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard danger>
      <div className="space-y-3">
        <div>
          <p className="font-bold text-[var(--accent-red)]">Factory reset</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Deletes all other users, all picks, and all weeks/games. Keeps your admin account. Re-opens
            registration and syncs the current ESPN week.
          </p>
        </div>
        <label className="block space-y-2 text-sm font-semibold">
          <span>Type RESET to confirm</span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="min-h-11 w-full max-w-xs rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-page)] px-3 font-mono"
            placeholder="RESET"
            autoComplete="off"
            autoCapitalize="characters"
          />
        </label>
        <button
          type="button"
          onClick={reset}
          disabled={busy || confirmText !== "RESET"}
          className="min-h-11 rounded-2xl bg-[var(--accent-red)] px-4 font-bold text-white disabled:opacity-60"
        >
          {busy ? "Resetting..." : "Reset"}
        </button>
      </div>
      <SectionSuccess message={msg} />
      <SectionError message={error} />
    </AdminCard>
  );
}
