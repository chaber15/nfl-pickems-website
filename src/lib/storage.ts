/**
 * localStorage wrappers that never throw. Safari private mode, blocked site data,
 * or a full quota make raw localStorage calls throw — that must not white-screen the app.
 */

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

export function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — ignore */
  }
}
