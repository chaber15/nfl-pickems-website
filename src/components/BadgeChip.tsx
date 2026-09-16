import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EarnedBadge } from "@shared/types";
import {
  BADGE_RARITY_LABEL,
  badgeChipClass,
  badgeRarity,
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
  /** Hide interactive tooltip (e.g. offscreen measure row). */
  inert?: boolean;
};

type TipCoords = {
  left: number;
  top: number;
  width: number;
};

export function BadgeChip({
  badge,
  showWeek = false,
  className = "",
  dense = false,
  inert = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<TipCoords | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const chipClass = badgeChipClass(badge.badgeId);
  const description = badge.description?.trim() || "Earned badge";

  useLayoutEffect(() => {
    if (!open || inert) {
      setTip(null);
      return;
    }
    const el = rootRef.current;
    if (!el) return;

    const place = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.min(224, window.innerWidth - 16);
      const approxH = 96;
      const gap = 6;
      const preferAbove = rect.top >= approxH + gap + 8;
      let left = rect.left < window.innerWidth / 2 ? rect.left : rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const top = preferAbove ? Math.max(8, rect.top - approxH - gap) : rect.bottom + gap;
      setTip({ left, top, width });
    };

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, inert]);

  useEffect(() => {
    if (!open || inert) return;
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
  }, [open, inert]);

  const tooltip =
    open && tip && !inert
      ? createPortal(
          <span
            id={tipId}
            role="tooltip"
            style={{
              position: "fixed",
              left: tip.left,
              top: tip.top,
              width: tip.width,
              zIndex: 200,
            }}
            className="rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-3 py-2 text-left shadow-[var(--shadow-card)]"
          >
            <span className="block text-xs font-bold text-[var(--text-primary)]">{badge.name}</span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {BADGE_RARITY_LABEL[badgeRarity(badge.badgeId)]}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
              {description}
            </span>
          </span>,
          document.body,
        )
      : null;

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex shrink-0 ${className}`}
      onMouseEnter={() => {
        if (!inert) setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        tabIndex={inert ? -1 : undefined}
        aria-describedby={open && !inert ? tipId : undefined}
        aria-expanded={inert ? undefined : open}
        onClick={() => {
          if (!inert) setOpen((v) => !v);
        }}
        onFocus={() => {
          if (!inert) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        className={`rounded-full border font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] ${
          dense
            ? "border px-1.5 py-0 text-[9px] leading-4 sm:text-[10px]"
            : "border-2 px-2.5 py-0.5 text-[10px] shadow-sm transition-transform hover:scale-[1.03] sm:text-[11px]"
        } ${chipClass}`}
      >
        {badge.name}
        {showWeek && !isSeasonScopedBadge(badge.weekNumber) ? ` · W${badge.weekNumber}` : ""}
      </button>
      {tooltip}
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
      const style = getComputedStyle(host);
      const padX =
        (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const avail = host.clientWidth - padX;
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
    <div ref={hostRef} className="relative min-w-0 max-w-full overflow-hidden py-0.5 pl-0.5 pr-1">
      {/* Off-layout measure row (full pool at natural size) */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0.5 top-0.5 flex flex-nowrap gap-1"
      >
        {pool.map((b) => (
          <BadgeChip
            key={`m-${b.badgeId}-${b.seasonType}-${b.weekNumber}-${b.earnedAt}`}
            badge={b}
            dense
            inert
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
