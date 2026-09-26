import { useState } from "react";
import {
  BADGE_RARITY_LABEL,
  badgeIcon,
  badgeRarity,
  badgeRarityClass,
  type BadgeChange,
  type BadgeKind,
} from "@shared/badges";
import {
  apiAdminApplyBadges,
  apiAdminPreviewBadges,
  type BadgeCatalogRow,
  type BadgePreview,
} from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import { AdminCard, SectionError, SectionSuccess, type AdminErrorHandler } from "./adminShared";

const KIND_LABEL: Record<BadgeKind, string> = {
  weekly: "weekly",
  first: "once a season",
  count: "season total",
};

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
          const rarity = b.rarity ?? badgeRarity(b.id);
          return (
            <li
              key={b.id}
              className={`rounded-xl border-2 px-3 py-2 text-sm ${badgeRarityClass(b.id)} ${
                b.timesEarned > 0 ? "badge-soft" : "border-dashed border-[var(--border-card)] opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-bold">
                  <span className={`badge-medal badge-medal--sm badge-emoji ${badgeRarityClass(b.id)}`} aria-hidden>
                    {badgeIcon(b.id)}
                  </span>
                  {b.name}
                </span>
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  {BADGE_RARITY_LABEL[rarity]}
                  {" · "}
                  {KIND_LABEL[b.kind] ?? b.kind}
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

function groupByPlayer(changes: BadgeChange[]): Array<[string, BadgeChange[]]> {
  const groups = new Map<string, BadgeChange[]>();
  for (const c of changes) {
    const list = groups.get(c.player) ?? [];
    list.push(c);
    groups.set(c.player, list);
  }
  return [...groups];
}

function whenLabel(c: BadgeChange): string {
  if (c.weekNumber == null) return "season";
  return c.seasonType === 3 ? `playoffs W${c.weekNumber}` : `W${c.weekNumber}`;
}

function PreviewList({ preview }: { preview: BadgePreview }) {
  const adds = preview.changes.filter((c) => c.action === "add").length;
  const removes = preview.changes.length - adds;
  const skipped = preview.weeks.filter((w) => w.status === "skipped_incomplete");

  if (preview.changes.length === 0) {
    return (
      <p className="mt-4 text-sm font-semibold text-[var(--accent-green)]">
        No changes — every badge already matches the rules.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm font-semibold">
        {adds} to add, {removes} to remove.
        {skipped.length > 0 && (
          <span className="font-normal text-[var(--text-muted)]">
            {" "}
            Weeks not fully final are skipped: {skipped.map((w) => `W${w.weekNumber}`).join(", ")}.
          </span>
        )}
      </p>
      <ul className="max-h-96 space-y-3 overflow-y-auto rounded-xl border-2 border-[var(--border-card)] p-3">
        {groupByPlayer(preview.changes).map(([player, list]) => (
          <li key={player}>
            <p className="font-bold">{player}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {list.map((c, i) => (
                <li key={`${c.action}-${c.badgeId}-${c.seasonType}-${c.weekNumber}-${i}`} className="flex gap-2">
                  <span
                    className={`w-4 shrink-0 text-center font-mono font-bold ${
                      c.action === "add" ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"
                    }`}
                  >
                    {c.action === "add" ? "+" : "−"}
                  </span>
                  <span>
                    {c.badgeName} <span className="text-[var(--text-muted)]">({whenLabel(c)})</span>
                    {c.note && <span className="text-[var(--text-muted)]"> — {c.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BadgeRecalcSection({ onDone, onError }: { onDone: () => void; onError: AdminErrorHandler }) {
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [preview, setPreview] = useState<BadgePreview | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const runPreview = async () => {
    setBusy("preview");
    setMsg("");
    setError("");
    try {
      setPreview(await apiAdminPreviewBadges());
    } catch (err) {
      setPreview(null);
      setError(onError(err, "Badge preview failed"));
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!preview) return;
    if (!confirmAction(`Apply ${preview.changes.length} badge change(s) exactly as previewed?`)) return;
    setBusy("apply");
    setMsg("");
    setError("");
    try {
      const res = await apiAdminApplyBadges(preview.fingerprint);
      setMsg(`Done — added ${res.added}, removed ${res.removed}.`);
      setPreview(null);
      onDone();
    } catch (err) {
      // A stale preview (409) is the common case: show why and make them preview again.
      setPreview(null);
      setError(onError(err, "Applying badge changes failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminCard>
      <div className="space-y-4">
        <div>
          <p className="font-bold">Recalculate badges</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            New badges are added automatically as weeks go final, but they are never taken away automatically.
            After a badge rule changes, preview here to see exactly who gains or loses what, then apply.
            Nothing changes until you press Apply.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={busy != null}
            className={
              preview
                ? "min-h-11 rounded-2xl border-2 border-[var(--border-card)] px-4 font-bold disabled:opacity-60"
                : "min-h-11 rounded-2xl bg-[var(--blue-fill)] px-4 font-bold text-[var(--on-fill)] disabled:opacity-60"
            }
          >
            {busy === "preview" ? "Checking..." : preview ? "Preview again" : "Preview recalculation"}
          </button>
          {preview && preview.changes.length > 0 && (
            <>
              <button
                type="button"
                onClick={apply}
                disabled={busy != null}
                className="min-h-11 rounded-2xl bg-[var(--blue-fill)] px-4 font-bold text-[var(--on-fill)] disabled:opacity-60"
              >
                {busy === "apply" ? "Applying..." : `Apply ${preview.changes.length} change(s)`}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={busy != null}
                className="min-h-11 rounded-2xl border-2 border-[var(--border-card)] px-4 font-bold disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      {preview && <PreviewList preview={preview} />}
      <SectionSuccess message={msg} />
      <SectionError message={error} />
    </AdminCard>
  );
}
