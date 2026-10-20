import { useSyncExternalStore } from "react";

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
  );
}

/** styles.css 의 .editor-panel 노출 기준과 같다. */
export const WIDE_EDITOR = "(min-width: 1180px)";
