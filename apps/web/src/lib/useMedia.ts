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

/**
 * 숫자 칸의 inputmode. 휴대폰에서는 숫자 키패드를 띄우고, PC에서는 넣지 않는다.
 * Windows Chrome은 inputmode="numeric"을 입력기에 숫자 전용 칸으로 알려 한글 입력기가 영문으로 바뀌고 돌아오지 않는다.
 */
export function useNumericInputMode(): "numeric" | undefined {
  return useMedia("(pointer: coarse)") ? "numeric" : undefined;
}
