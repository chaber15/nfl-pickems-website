import type { ReactNode } from "react";

/** Playing field only (no end zones), in yard units. */
const FIELD = 100;
const MID = 50;

/** 10-yard labels from one goal line down the field and back. */
const YARD_NUMBERS: Array<{ pct: number; label: string }> = [
  { pct: (10 / FIELD) * 100, label: "10" },
  { pct: (20 / FIELD) * 100, label: "20" },
  { pct: (30 / FIELD) * 100, label: "30" },
  { pct: (40 / FIELD) * 100, label: "40" },
  { pct: (MID / FIELD) * 100, label: "50" },
  { pct: (60 / FIELD) * 100, label: "40" },
  { pct: (70 / FIELD) * 100, label: "30" },
  { pct: (80 / FIELD) * 100, label: "20" },
  { pct: (90 / FIELD) * 100, label: "10" },
];

function SideRail({ side }: { side: "left" | "right" }) {
  const w = 56;
  const fromOuter = side === "left";

  const yardMarks: number[] = [];
  for (let y = 1; y < FIELD; y += 1) {
    yardMarks.push(y);
  }

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 z-0 w-8 sm:w-16 md:w-24 ${
        side === "left" ? "left-0" : "right-0"
      }`}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${w} ${FIELD}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Midfield */}
        <line
          x1={0}
          x2={w}
          y1={MID}
          y2={MID}
          stroke="var(--accent-green)"
          strokeOpacity="0.9"
          strokeWidth="3.5"
          vectorEffect="non-scaling-stroke"
        />

        {yardMarks.map((y) => {
          if (y === MID) return null;
          const isFive = y % 5 === 0;
          const isTen = y % 10 === 0;
          const shortFrac = 0.48;
          const fiveFrac = 0.82;
          const tenFrac = 1;
          const frac = isTen ? tenFrac : isFive ? fiveFrac : shortFrac;
          const x1 = fromOuter ? 0 : w * (1 - frac);
          const x2 = fromOuter ? w * frac : w;
          return (
            <line
              key={y}
              x1={x1}
              x2={x2}
              y1={y}
              y2={y}
              stroke="var(--accent-green)"
              strokeOpacity={isTen ? 0.92 : isFive ? 0.78 : 0.58}
              strokeWidth={isTen ? 3 : isFive ? 2.5 : 1.85}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {YARD_NUMBERS.map(({ pct, label }) => {
        const [a, b] = label.split("");
        // Right rail rotation flips reading order — swap digits so it still reads e.g. "10"
        const top = side === "left" ? a : b;
        const bottom = side === "left" ? b : a;
        const rot = side === "left" ? "rotate-90" : "-rotate-90";
        return (
          <span
            key={`${side}-${pct}`}
            className="absolute left-1/2 flex w-full -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
            style={{ top: `${pct}%` }}
          >
            <span
              className={`font-display-heavy flex h-4 w-4 items-center justify-center text-sm leading-none tracking-tight text-[var(--accent-green)] sm:h-8 sm:w-10 sm:text-4xl ${rot}`}
            >
              {top}
            </span>
            <span className="h-0.5 w-full shrink-0 sm:h-2" aria-hidden />
            <span
              className={`font-display-heavy flex h-4 w-4 items-center justify-center text-sm leading-none tracking-tight text-[var(--accent-green)] sm:h-8 sm:w-10 sm:text-4xl ${rot}`}
            >
              {bottom}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Sideline rails that read like the edge of a football field:
 * every-yard hashes from goal line to goal line through midfield 50.
 */
export function FieldFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate -mx-4 min-h-full sm:-mx-8">
      <SideRail side="left" />
      <SideRail side="right" />
      <div className="relative z-10 px-9 sm:px-16 md:px-24">{children}</div>
    </div>
  );
}
