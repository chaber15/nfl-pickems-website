import { storageGet, storageSet } from "./storage";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "theme";

export function getThemeMode(): ThemeMode {
  const stored = storageGet(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function applyTheme(mode: ThemeMode) {
  const dark = resolveDark(mode);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0d1015" : "#f4f6f8");
}

export function setThemeMode(mode: ThemeMode) {
  storageSet(THEME_KEY, mode);
  applyTheme(mode);
}

/** Keep "Match my device" in sync when the OS switches light/dark (e.g. at sunset). */
export function watchSystemTheme(): () => void {
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return () => {};
  }
  const onChange = () => {
    if (getThemeMode() === "system") applyTheme("system");
  };
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}
