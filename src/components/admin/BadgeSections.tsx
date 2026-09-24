import { useState } from "react";
import {
  BADGE_RARITY_LABEL,
  badgeName,
  badgeRarity,
  badgeSoftClass,
  LIFETIME_THRESHOLD_BADGE_IDS,
  type BadgeRarity,
} from "@shared/badges";
import { apiAdminRefreshBadges, type BadgeCatalogRow, type BadgeRefreshResult } from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { AdminCard, SectionError, SectionSuccess, type AdminErrorHandler } from "./adminShared";

const cumulativeBadgeLabel = LIFETIME_THRESHOLD_BADGE_IDS.map(badgeName).join(" / ");

export function BadgeCatalogSection({ rows }: { rows: BadgeCatalogRow[] }) {
  const ordered = [...rows].sort(
    (a, b) =>
      (b.rarity ?? badgeRarity(b.id)) - (a.rarity ?? badgeRarity(a.id)) || a.name.localeCompare(b.name),
  );
  return (
    <AdminCard>
      <p className="font-bold">Badge catalog</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        All possible badges, rarest first. Locked rows have never been earned. Players only see badges they
        have earned.
      </p>
      <ul className="mt-4 space-y-2">
        {ordered.map((b) => {
          const rarity = (b.rarity ?? badgeRarity(b.id)) as BadgeRarity;
          return (
            <li
              key={b.id}
              className={`rounded-xl border-2 px-3 py-2 text-sm ${
                b.timesEarned > 0 ? badgeSoftClass(b.id) : "border-dashed border-[var(--border-card)] opacity-60"
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
        {ordered.length === 0 && <li className="text-sm text-[var(--text-muted)]">No catalog loaded.</li>}
      </ul>
    </AdminCard>
  );
}

function formatBadgeRefreshMsg(res: BadgeRefreshResult) {
  const parts = res.weeks.map((w) => {
    if (w.status === "skipped_incomplete") return `S${w.seasonType} W${w.week}: skipped (week not fully final)`;
    if (w.status === "skipped_empty") return `S${w.seasonType} W${w.week}: skipped (no games)`;
    return `S${w.seasonType} W${w.week}: +${w.awarded} award(s)`;
  });
  const fullWipe = res.wiped != null ? ` Cleared ${res.wiped} existing badge(s), then recalculated.` : "";
  const life = res.lifetime
    ? ` Cumulative: removed ${res.lifetime.removed}, left ${res.lifetime.remainingAfterWipe ?? "?"}, granted ${res.lifetime.granted}.`
    : "";
  const weekPart = parts.length ? ` ${parts.join(" · ")}` : "";
  return `Done — ${res.totalAwarded} award(s).${fullWipe}${life}${weekPart}`;
}

export function BadgeRecalcSection({ onDone, onError }: { onDone: () => void; onError: AdminErrorHandler }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    if (
      !confirmAction(
        `Recalculate every badge from scratch for all fully final weeks (including ${cumulativeBadgeLabel} career thresholds)?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await apiAdminRefreshBadges({ allCompleted: true });
      setMsg(formatBadgeRefreshMsg(res));
      onDone();
    } catch (err) {
      setError(onError(err, "Badge recalculate failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard>
      <div className="space-y-4">
        <div>
          <p className="font-bold">Recalculate badges</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Only needed if something looks wrong — badges award themselves as weeks go final. Recomputes all
            fully final weeks in order from stored picks and finals. Cumulative badges ({cumulativeBadgeLabel})
            are re-granted from career totals.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="min-h-11 rounded-2xl bg-[var(--accent-blue)] px-4 font-bold text-white disabled:opacity-60"
        >
          {busy ? "Recalculating..." : "Recalculate badges"}
        </button>
      </div>
      <SectionSuccess message={msg} />
      <SectionError message={error} />
    </AdminCard>
  );
}
