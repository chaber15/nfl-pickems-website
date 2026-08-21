import { Moon, Sun, Monitor } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { cycleTheme, getThemeMode, type ThemeMode } from "../lib/theme";
import { useState } from "react";

const labels: Record<ThemeMode, string> = {
  light: "Light mode",
  dark: "Dark mode",
  system: "System theme",
};

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());
  const reduce = useReducedMotion();

  const handleClick = () => {
    const next = cycleTheme();
    setMode(next);
  };

  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      aria-label={labels[mode]}
      className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-primary)]"
      whileTap={reduce ? undefined : { scale: 0.95 }}
    >
      <Icon size={22} weight="bold" />
    </motion.button>
  );
}
