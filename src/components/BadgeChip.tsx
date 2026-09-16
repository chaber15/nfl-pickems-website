import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { EarnedBadge } from "@shared/types";
import {
  BADGE_TONE_CHIP,
  BADGE_RARITY_LABEL,
  badgeRarity,
  badgeTone,
  compareBadgeRarity,
  isSeasonScopedBadge,
} from "@shared/badges";

type Props = {
  badge: EarnedBadge;
  /** Show week suffix like · W2 */
  showWeek?: boolean;
  className?: string;
  /** Compact density for leaderboard single-line trails. */
  dense?: boolean;
};

type TipPlace = {
  align: "left" | "right";
  side: "above" | "below";
};

export function BadgeChip({ badge, showWeek = false, className = "", dense = false }: Props) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<TipPlace>({ align: "left", side: "above" });
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const tone = badgeTone(badge.badgeId);
  const chipClass = BADGE_TONE_CHIP[tone];
  const description = badge.description?.trim() || "Earned badge";

  useLayoutEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipH = 88;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const side: "above" | "below" =
      spaceAbove >= tipH || spaceAbove >= spaceBelow ? "above" : "below";
    setPlace({
      align: rect.left < window.innerWidth / 2 ? "left" : "right",
      side,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex shrink-0 ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`rounded-full border font-bold shadow-sm outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] ${
          dense
            ? "border px-1.5 py-0 text-[9px] leading-4 sm:text-[10px]"
            : "border-2 px-2.5 py-0.5 text-[10px] sm:text-[11px]"
        } ${chipClass}`}
      >
        {badge.name}
        {showWeek && !isSeasonScopedBadge(badge.weekNumber) ? ` · W${badge.weekNumber}` : ""}
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className={`absolute z-50 w-[min(14rem,calc(100vw-2rem))] rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-3 py-2 text-left shadow-[var(--shadow-card)] ${
            place.side === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } ${place.align === "left" ? "left-0" : "right-0"}`}
        >
          <span className="block text-xs font-bold text-[var(--text-primary)]">{badge.name}</span>
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {BADGE_RARITY_LABEL[badgeRarity(badge.badgeId)]}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
            {description}
          </span>
        </span>
      )}
    </span>
  );
}

function sortByRarity(badges: EarnedBadge[]): EarnedBadge[] {
  return [...badges].sort((a, b) => compareBadgeRarity(a.badgeId, b.badgeId));
}

/** Keep first of each badgeId (pass rarity-sorted list). */
function uniqueByBadgeId(badges: EarnedBadge[]): EarnedBadge[] {
  const seen = new Set<string>();
  const out: EarnedBadge[] = [];
  for (const b of badges) {
    if (seen.has(b.badgeId)) continue;
    seen.add(b.badgeId);
    out.push(b);
  }
  return out;
}

/**
 * Single-line badge trail for leaderboard rows — never wraps.
 * - week: all badges (rarity-sorted); scales down to fit.
 * - overall: rarest unique badges (≤5); drops count if the row is too narrow.
 */
export function LeaderboardBadgeTrail({
  badges,
  mode,
}: {
  badges: EarnedBadge[];
  mode: "week" | "overall";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [visibleCount, setVisibleCount] = useState(5);

  const poolKey = badges.map((b) => b.badgeId).join("|");
  const pool = (() => {
    const ordered = sortByRarity(badges);
    return mode === "overall" ? uniqueByBadgeId(ordered).slice(0, 5) : ordered;
  })();

  useLayoutEffect(() => {
    const host = hostRef.current;
    const measure = measureRef.current;
    if (!host || !measure || pool.length === 0) return;

    const sync = () => {
      const avail = host.clientWidth;
      if (avail <= 0) return;

      const kids = Array.from(measure.children) as HTMLElement[];
      const gap = 4;

      if (mode === "week") {
        let need = 0;
        for (let i = 0; i < kids.length; i++) {
          need += kids[i].offsetWidth + (i > 0 ? gap : 0);
        }
        setScale(need > avail ? Math.max(0.42, avail / need) : 1);
        setVisibleCount(pool.length);
        return;
      }

      // Overall: how many rarest chips fit at full size.
      let used = 0;
      let fit = 0;
      for (let i = 0; i < kids.length; i++) {
        const next = used + (fit > 0 ? gap : 0) + kids[i].offsetWidth;
        if (next > avail + 0.5) break;
        used = next;
        fit += 1;
      }
      setScale(1);
      setVisibleCount(Math.max(fit, kids.length > 0 ? 1 : 0));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(host);
    return () => ro.disconnect();
  }, [mode, poolKey, pool.length]);

  if (pool.length === 0) return null;

  const shown = mode === "overall" ? pool.slice(0, visibleCount) : pool;

  return (
    <div ref={hostRef} className="relative min-w-0 max-w-full overflow-hidden">
      {/* Off-layout measure row (full pool at natural size) */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex flex-nowrap gap-1"
      >
        {pool.map((b) => (
          <BadgeChip
            key={`m-${b.badgeId}-${b.seasonType}-${b.weekNumber}-${b.earnedAt}`}
            badge={b}
            dense
          />
        ))}
      </div>

      <div
        className="flex flex-nowrap items-center gap-1"
        style={
          mode === "week"
            ? {
                transform: `scale(${scale})`,
                transformOrigin: "left center",
                width: scale < 1 ? `${100 / scale}%` : undefined,
              }
            : undefined
        }
      >
        {shown.map((b) => (
          <BadgeChip
            key={`${b.badgeId}-${b.seasonType}-${b.weekNumber}-${b.earnedAt}`}
            badge={b}
            dense
          />
        ))}
      </div>
    </div>
  );
}

/** Stats / general wrap-allowed chip row (not used on leaderboard lines). */
export function BadgeChipRow({
  badges,
  showWeek = false,
}: {
  badges: EarnedBadge[];
  showWeek?: boolean;
}) {
  if (badges.length === 0) return null;
  const ordered = sortByRarity(badges);
  return (
    <div className="flex flex-wrap gap-1.5">
      {ordered.map((b) => (
        <BadgeChip
          key={`${b.badgeId}-${b.seasonType}-${b.weekNumber}-${b.earnedAt}`}
          badge={b}
          showWeek={showWeek}
        />
      ))}
    </div>
  );
}
