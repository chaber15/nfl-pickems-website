import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Question } from "./icons";

/** Small (?) button that toggles a plain-language explanation. Works with tap, mouse, and keyboard. */
export function HelpTip({
  label,
  children,
  align = "left",
}: {
  /** Accessible name, e.g. "What is juice?" */
  label: string;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  /** Horizontal nudge (px) that keeps the bubble on screen when the (?) sits near an edge. */
  const [shift, setShift] = useState(0);

  const toggle = () => {
    if (!open) setShift(onScreenShift());
    setOpen((v) => !v);
  };

  /**
   * Worked out before the bubble renders (from the button and the bubble's CSS width), so it never
   * overflows even for a frame — phones zoom the page out on any overflow and don't zoom back.
   */
  const onScreenShift = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return 0;
    const viewW = document.documentElement.clientWidth;
    const pad = 8;
    const width = Math.min(256, viewW - 40); // w-[min(16rem,calc(100vw-2.5rem))]
    const left = align === "left" ? r.left : r.right - width;
    if (left + width > viewW - pad) return viewW - pad - (left + width);
    if (left < pad) return pad - left;
    return 0;
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={toggle}
        className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--accent-blue)] focus-visible:outline-2 focus-visible:outline-[var(--accent-blue)]"
      >
        <Question size={16} weight="bold" />
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          className={`absolute top-9 z-30 block w-[min(16rem,calc(100vw-2.5rem))] rounded-xl border-2 border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-3 py-2.5 text-left text-xs font-medium leading-relaxed text-[var(--text-primary)] shadow-[var(--shadow-card)] ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export const JUICE_HELP =
  "Juice is the price of a bet. −110 means you risk 1.10 units to win 1. A plus number like +105 means you risk 1 to win 1.05.";

export const PL_HELP =
  "P/L means profit and loss: the units you'd be up or down on your ★ confidence bets, using each game's juice. It's play money — just for bragging rights.";
