import { teamLogoSrc } from "../../lib/teamLogos";

export function TeamLogo({ abbrev, name, size = 40 }: { abbrev: string; name: string; size?: number }) {
  const src = teamLogoSrc(abbrev);
  if (!src) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--bg-card-elevated)] font-mono text-xs font-bold"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {abbrev.slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="team-logo shrink-0 object-contain"
      style={{ width: size, height: size }}
      title={name}
    />
  );
}
