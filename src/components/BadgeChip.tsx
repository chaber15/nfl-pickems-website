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
  const chipClass = badgeChipClass(badge.badgeId);
  const description = badge.description?.trim() || "Earned badge";
  const tip = `${badge.name} · ${BADGE_RARITY_LABEL[badgeRarity(badge.badgeId)]} — ${description}`;

  return (
    <span
      title={tip}
      className={`inline-flex shrink-0 rounded-full border font-bold ${
        dense
          ? "border px-1.5 py-0 text-[9px] leading-4 sm:text-[10px]"
          : "border-2 px-2.5 py-0.5 text-[10px] shadow-sm sm:text-[11px]"
      } ${chipClass} ${className}`}
    >
      {badge.name}
      {showWeek && !isSeasonScopedBadge(badge.weekNumber) ? ` · W${badge.weekNumber}` : ""}
    </span>
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
