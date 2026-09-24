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
  showWeek?: boolean;
  className?: string;
  dense?: boolean;
};

export function BadgeChip({ badge, showWeek = false, className = "", dense = false }: Props) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  /** Mouse hover or keyboard focus. */
  const [hover, setHover] = useState(false);
  /** Tapped / clicked open — stays until tapped again, tapped elsewhere, or Escape. */
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const chipClass = badgeChipClass(badge.badgeId);
  const description = badge.description?.trim() || "Earned badge";
  const tip = `${badge.name} · ${BADGE_RARITY_LABEL[badgeRarity(badge.badgeId)]} — ${description}`;
  const label = `${badge.name}${
    showWeek && !isSeasonScopedBadge(badge.weekNumber) ? ` · W${badge.weekNumber}` : ""
  }`;

  useLayoutEffect(() => {
    if (!open || !chipRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = chipRef.current?.getBoundingClientRect();
      if (!r) return;
      const pad = 8;
      const maxW = Math.min(288, window.innerWidth - pad * 2);
      let left = r.left + r.width / 2;
      left = Math.min(window.innerWidth - pad - maxW / 2, Math.max(pad + maxW / 2, left));
      const top = Math.min(window.innerHeight - pad, r.bottom + 6);
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const onPointer = (e: PointerEvent) => {
      if (!chipRef.current?.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setHover(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={pinned}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHover(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(false);
        }}
        onFocus={(e) => {
          // Keyboard focus only — a tap also focuses, and the click handler owns taps.
          if (e.currentTarget.matches(":focus-visible")) setHover(true);
        }}
        onBlur={() => {
          setHover(false);
          setPinned(false);
        }}
        onClick={() => {
          setPinned((v) => !v);
          setHover(false);
        }}
        className={`inline-flex shrink-0 cursor-help rounded-full border font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] ${
          dense
            ? "border px-1.5 py-0 text-[9px] leading-4 sm:text-[10px]"
            : "border-2 px-2.5 py-0.5 text-[10px] shadow-sm sm:text-[11px]"
        } ${chipClass} ${className}`}
      >
        {label}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            className="pointer-events-none fixed z-[200] w-[min(18rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-3 py-2 text-left text-xs font-semibold leading-snug text-[var(--text-primary)] shadow-[var(--shadow-card)]"
            style={{ top: pos.top, left: pos.left }}
          >
            {tip}
          </div>,
          document.body,
        )}
    </>
  );
}

function sortByRarity(badges: EarnedBadge[]): EarnedBadge[] {
  return [...badges].sort((a, b) => compareBadgeRarity(a.badgeId, b.badgeId));
}

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

/** Single-line badge trail for leaderboard rows — CSS truncates overflow. */
export function LeaderboardBadgeTrail({
  badges,
  mode,
}: {
  badges: EarnedBadge[];
  mode: "week" | "overall";
}) {
  const ordered = sortByRarity(badges);
  const pool = mode === "overall" ? uniqueByBadgeId(ordered).slice(0, 5) : ordered;
  if (pool.length === 0) return null;

  return (
    <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden py-0.5">
      {pool.map((b) => (
        <BadgeChip
          key={`${b.badgeId}-${b.seasonType}-${b.weekNumber}-${b.earnedAt}`}
          badge={b}
          dense
        />
      ))}
    </div>
  );
}

export function BadgeChipRow({
  badges,
  showWeek = false,
}: {
  badges: EarnedBadge[];
  showWeek?: boolean;
}) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sortByRarity(badges).map((b) => (
        <BadgeChip
          key={`${b.badgeId}-${b.seasonType}-${b.weekNumber}-${b.earnedAt}`}
          badge={b}
          showWeek={showWeek}
        />
      ))}
    </div>
  );
}
