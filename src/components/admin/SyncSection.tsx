import { useState } from "react";
import { shortWeekLabel } from "@shared/weekUtils";
import { apiSyncEspn } from "../../lib/api";
import { useGames } from "../../lib/gamesContext";
import { useWeek } from "../../lib/weekContext";
import { AdminCard, SectionError, SectionSuccess, type AdminErrorHandler } from "./adminShared";

export function SyncSection({ onError }: { onError: AdminErrorHandler }) {
  const { seasonType, week } = useWeek();
  const { refresh } = useGames();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const sync = async () => {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await apiSyncEspn(seasonType, week);
      setMsg(`Synced ${res.upserted} games for ${shortWeekLabel(seasonType, week)}.`);
      void refresh();
    } catch (err) {
      setError(onError(err, "Sync failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-bold">ESPN sync</p>
          <p className="text-sm text-[var(--text-muted)]">
            Pull games, spreads, and grade finals for {shortWeekLabel(seasonType, week)}.
          </p>
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={busy}
          className="min-h-11 rounded-2xl bg-[var(--accent-fill)] px-4 font-bold text-[var(--on-fill)] disabled:opacity-60"
        >
          {busy ? "Syncing..." : "Sync now"}
        </button>
      </div>
      <SectionSuccess message={msg} />
      <SectionError message={error} />
    </AdminCard>
  );
}
