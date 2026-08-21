export type ThemeMode = "light" | "dark" | "system";

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode) {
  const dark = resolveDark(mode);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#1a3a1a" : "#f8faf8");
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem("theme", mode);
  applyTheme(mode);
}

export function cycleTheme(): ThemeMode {
  const current = getThemeMode();
  const next: ThemeMode = current === "light" ? "dark" : current === "dark" ? "system" : "light";
  setThemeMode(next);
  return next;
}
