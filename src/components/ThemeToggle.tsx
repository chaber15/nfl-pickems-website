import { useState } from "react";
import { Moon, Sun, Monitor } from "./icons";
import { cycleTheme, getThemeMode, type ThemeMode } from "../lib/theme";

const labels: Record<ThemeMode, string> = {
  light: "Light mode",
  dark: "Dark mode",
  system: "System theme",
};

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());

  const handleClick = () => {
    setMode(cycleTheme());
  };

  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={labels[mode]}
      className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-transform active:scale-95"
    >
      <Icon size={22} />
    </button>
  );
}
