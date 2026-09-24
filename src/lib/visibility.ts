import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * One app-wide, debounced "the user came back to the tab" signal.
 * visibilitychange + focus often fire together (and focus fires on every click back
 * into the window), so subscribers get at most one call per DEBOUNCE_MS.
 */
const DEBOUNCE_MS = 1_000;

type Listener = () => void;
const listeners = new Set<Listener>();
let attached = false;
let timer: number | null = null;

function fire() {
  if (document.visibilityState !== "visible") return;
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    if (document.visibilityState !== "visible") return;
    for (const l of [...listeners]) l();
  }, DEBOUNCE_MS);
}

function attach() {
  if (attached) return;
  attached = true;
  document.addEventListener("visibilitychange", fire);
  window.addEventListener("focus", fire);
}

/** Subscribe to the debounced "tab visible again" signal. Returns an unsubscribe function. */
export function onTabReturn(listener: Listener): () => void {
  attach();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Calls the latest `callback` when the user returns to the tab (debounced, app-wide). */
export function useTabReturn(callback: () => void, enabled = true) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });
  useEffect(() => {
    if (!enabled) return;
    return onTabReturn(() => ref.current());
  }, [enabled]);
}

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/** True while the page is visible — used to pause polling in background tabs. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
}
