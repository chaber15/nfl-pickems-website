import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EarnedBadge } from "@shared/types";
import {
  BADGE_RARITY_LABEL,
  badgeIcon,
  badgeRarity,
  badgeRarityClass,
  groupEarnedBadges,
  type BadgeGroup,
} from "@shared/badges";
import { weekLabel } from "@shared/weekUtils";

/** Medals shown in a leaderboard row before collapsing the rest into "+N". */
const TRAIL_MAX = 5;

function earnedLine(g: BadgeGroup): string {
  if (g.weeks.length === 0) {
    const d = new Date(g.earnedAt);
    return Number.isNaN(d.getTime())
      ? "Earned this season"
      : `Earned ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const labels = g.weeks.map((w) => weekLabel(w.seasonType ?? 2, w.weekNumber));
  return g.count > 1 ? `Earned ${g.count}× · ${labels.join(", ")}` : `Earned ${labels[0]}`;
}

function accessibleName(g: BadgeGroup): string {
  const rarity = BADGE_RARITY_LABEL[badgeRarity(g.badgeId)];
  return `${g.name}, ${rarity}${g.count > 1 ? `, earned ${g.count} times` : ""}`;
}

function BadgeTipCard({ group, id }: { group: BadgeGroup; id: string }) {
  const rarity = badgeRarityClass(group.badgeId);
  return (
    <div id={id} role="tooltip" className={`badge-tip ${rarity}`}>
      <div className="badge-tip__head">
        <span className={`badge-medal badge-medal--lg badge-emoji ${rarity}`} aria-hidden>
          {badgeIcon(group.badgeId)}
        </span>
        <div>
          <div className="badge-tip__name">{group.name}</div>
          <div className="badge-tip__rarity">{BADGE_RARITY_LABEL[badgeRarity(group.badgeId)]}</div>
        </div>
      </div>
      <p className="badge-tip__desc">{group.description?.trim() || "Earned badge"}</p>
      <p className="badge-tip__meta">{earnedLine(group)}</p>
    </div>
  );
}

/**
 * A badge you can hover (mouse), focus (keyboard) or tap (touch) to see its card.
 * A tap pins the card open until you tap elsewhere or press Escape.
 */
function BadgeTrigger({ group, children }: { group: BadgeGroup; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
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
      if (!ref.current?.contains(e.target as Node)) setPinned(false);
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
        ref={ref}
        type="button"
        className="badge-trigger"
        aria-label={accessibleName(group)}
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
      >
        {children}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[200] w-[min(18rem,calc(100vw-1rem))] -translate-x-1/2"
            style={{ top: pos.top, left: pos.left }}
          >
            <BadgeTipCard group={group} id={tipId} />
          </div>,
          document.body,
        )}
    </>
  );
}

function BadgeMedal({ group }: { group: BadgeGroup }) {
  return (
    <BadgeTrigger group={group}>
      <span className={`badge-medal badge-medal--sm badge-emoji ${badgeRarityClass(group.badgeId)}`} aria-hidden>
        {badgeIcon(group.badgeId)}
      </span>
    </BadgeTrigger>
  );
}

function BadgeEmblem({ group }: { group: BadgeGroup }) {
  return (
    <BadgeTrigger group={group}>
      <span className={`badge-emblem ${badgeRarityClass(group.badgeId)}`} aria-hidden>
        <span className="badge-emblem__icon badge-emoji">{badgeIcon(group.badgeId)}</span>
        {group.name}
        {group.count > 1 && <span className="badge-count">×{group.count}</span>}
      </span>
    </BadgeTrigger>
  );
}

/**
 * Leaderboard row: round medals, rarest first, one per badge (repeats show ×N in the card).
 * `mode` is kept for callers; both modes group repeats the same way.
 */
export function LeaderboardBadgeTrail({
  badges,
}: {
  badges: EarnedBadge[];
  mode: "week" | "overall";
}) {
  const groups = groupEarnedBadges(badges);
  if (groups.length === 0) return null;
  const shown = groups.slice(0, TRAIL_MAX);
  const hidden = groups.slice(TRAIL_MAX);
  return (
    <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5 py-0.5">
      {shown.map((g) => (
        <BadgeMedal key={g.badgeId} group={g} />
      ))}
      {hidden.length > 0 && (
        <span className="badge-more" title={hidden.map((g) => g.name).join(", ")}>
          +{hidden.length}
          <span className="sr-only"> more: {hidden.map((g) => g.name).join(", ")}</span>
        </span>
      )}
    </div>
  );
}

/** Stats page: emblem chips with names, rarest first, repeats shown as ×N. */
export function BadgeChipRow({ badges }: { badges: EarnedBadge[] }) {
  const groups = groupEarnedBadges(badges);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => (
        <BadgeEmblem key={g.badgeId} group={g} />
      ))}
    </div>
  );
}
