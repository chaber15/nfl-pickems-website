import { useCallback, useSyncExternalStore } from "react";

function safeMatch(query: string): MediaQueryList | null {
  try {
    return window.matchMedia(query);
  } catch {
    return null;
  }
}

/** Live `matchMedia` result, so components can mount only when a breakpoint applies. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = safeMatch(query);
      if (!mq) return () => {};
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => safeMatch(query)?.matches ?? false,
    () => false,
  );
}

/** Tailwind `lg` breakpoint (1024px). */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
