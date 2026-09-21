import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CaretLeft, CaretRight } from "./icons";
import { buildWeekOptions, shortWeekLabel, weekOptionIndex } from "@shared/weekUtils";
import { useWeek } from "../lib/weekContext";

type PhaseTab = "reg" | "post";

function phaseTabFor(seasonType: number): PhaseTab {
  if (seasonType === 3) return "post";
  return "reg";
}

function seasonTypeForTab(tab: PhaseTab): number {
  if (tab === "post") return 3;
  return 2;
}

export function WeekSelector() {
  const { seasonType, week, setWeekSelection } = useWeek();
  const options = buildWeekOptions();
  const index = weekOptionIndex(seasonType, week);
  const prev = index > 0 ? options[index - 1] : null;
  const next = index >= 0 && index < options.length - 1 ? options[index + 1] : null;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PhaseTab>(() => phaseTabFor(seasonType));
  const [panelTop, setPanelTop] = useState<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    setTab(phaseTabFor(seasonType));
  }, [seasonType]);

  // Mobile uses position:fixed — keep the panel under the trigger and inside the viewport.
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setPanelTop(rect.bottom + 8);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tabWeeks = options.filter((o) => o.seasonType === seasonTypeForTab(tab));

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous week"
        disabled={!prev}
        onClick={() => prev && setWeekSelection(prev.seasonType, prev.week)}
        className="hidden h-11 w-11 items-center justify-center rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-elevated)] disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
      >
        <CaretLeft size={20} weight="bold" />
      </button>

      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="min-h-11 min-w-[6.5rem] rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-3 font-display text-xl text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--accent-green)] focus:border-[var(--accent-green)] sm:min-w-[9rem] sm:text-2xl"
      >
        {shortWeekLabel(seasonType, week)}
      </button>

      <button
        type="button"
        aria-label="Next week"
        disabled={!next}
        onClick={() => next && setWeekSelection(next.seasonType, next.week)}
        className="hidden h-11 w-11 items-center justify-center rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-elevated)] disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
      >
        <CaretRight size={20} weight="bold" />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Jump to week"
          style={
            panelTop != null
              ? ({ "--week-panel-top": `${panelTop}px` } as CSSProperties)
              : undefined
          }
          className="fixed inset-x-4 top-[var(--week-panel-top,5.5rem)] z-40 w-auto rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-card)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[min(18rem,calc(100vw-2rem))]"
        >
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-[var(--bg-page)] p-1">
            {(
              [
                ["reg", "Reg"],
                ["post", "Post"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`min-h-9 rounded-lg text-xs font-bold tracking-wide ${
                  tab === id
                    ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`grid gap-1.5 ${tab === "reg" ? "grid-cols-6" : "grid-cols-4"}`}>
            {tabWeeks.map((opt) => {
              const active = opt.seasonType === seasonType && opt.week === week;
              const chip =
                tab === "reg"
                  ? String(opt.week)
                  : opt.week === 1
                    ? "WC"
                    : opt.week === 2
                      ? "DIV"
                      : opt.week === 3
                        ? "CONF"
                        : "SB";
              return (
                <button
                  key={`${opt.seasonType}-${opt.week}`}
                  type="button"
                  title={opt.label}
                  onClick={() => {
                    setWeekSelection(opt.seasonType, opt.week);
                    setOpen(false);
                  }}
                  className={`min-h-10 rounded-xl text-xs font-bold ${
                    active
                      ? "bg-[var(--accent-green)] text-[var(--accent-on-green)]"
                      : "bg-[var(--bg-page)] text-[var(--text-primary)] hover:bg-[var(--bg-card-elevated)]"
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
