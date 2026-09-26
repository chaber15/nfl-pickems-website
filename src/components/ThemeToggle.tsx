import { useEffect, useId, useRef, useState } from "react";
import { Moon, Sun, Monitor } from "./icons";
import { getThemeMode, setThemeMode, type ThemeMode } from "../lib/theme";

const OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
  { mode: "system", label: "Match my device", Icon: Monitor },
];

const SHORT: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "Auto" };

/** Header button that opens a small Light / Dark / Match-my-device menu. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  const choose = (next: ThemeMode) => {
    setThemeMode(next);
    setMode(next);
    setOpen(false);
  };

  const Current = OPTIONS.find((o) => o.mode === mode)!.Icon;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Theme: ${OPTIONS.find((o) => o.mode === mode)!.label}`}
        className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] px-2.5 text-sm font-semibold text-[var(--text-primary)] transition-transform active:scale-95"
      >
        <Current size={20} />
        <span className="hidden sm:inline">{SHORT[mode]}</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="absolute right-0 top-full z-50 mt-2 w-52 rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] p-1.5 shadow-[var(--shadow-card)]"
        >
          {OPTIONS.map(({ mode: m, label, Icon }) => {
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(m)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${
                  active
                    ? "bg-[var(--accent-fill)] text-[var(--on-fill)]"
                    : "text-[var(--text-primary)] hover:bg-[var(--bg-card-elevated)]"
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
