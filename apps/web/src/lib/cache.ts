import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { session } from "./api.ts";

const CACHE = "domo.query-cache.v1";
const MAX_AGE = 24 * 60 * 60 * 1000;
const allowed = new Set(["me", "household", "transactions", "suggestions", "budgets", "recurring", "search"]);
function removeCache() { try { localStorage.removeItem(CACHE); } catch { /* 저장소 접근 제한 시 메모리 캐시를 사용한다. */ } }

async function ownerOf(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}

/** 인증 정보는 복제하지 않고 세션 지문이 같은 경우에만 마지막 조회를 복원한다. */
export async function installCache(client: QueryClient) {
  try {
    const value = session.get();
    const saved = JSON.parse(localStorage.getItem(CACHE) ?? "null");
    if (value && saved?.owner === await ownerOf(value) && value === session.get() && Date.now() - saved.at < MAX_AGE) hydrate(client, saved.state);
    else removeCache();
  } catch { removeCache(); }
  let sessionValue = session.get();
  let timer: ReturnType<typeof setTimeout>;
  const unsubscribe = client.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void (async () => {
      const value = session.get();
      if (!value || client.isMutating()) return;
      try {
        const owner = await ownerOf(value);
        if (value !== session.get()) return;
        const state = dehydrate(client, {
          shouldDehydrateQuery: (q) => q.state.data !== undefined && Date.now() - q.state.dataUpdatedAt < MAX_AGE && allowed.has(String(q.queryKey[0])),
        });
        for (const q of state.queries) q.state = { ...q.state, status: "success", error: null, fetchStatus: "idle", fetchFailureCount: 0, fetchFailureReason: null };
        localStorage.setItem(CACHE, JSON.stringify({ owner, at: Date.now(), state }));
      } catch { /* 기기 저장 공간이 부족해도 온라인 사용을 유지한다. */ }
    })(), 300);
  });
  const signedOut = () => {
    clearTimeout(timer);
    client.clear();
    removeCache(); sessionValue = session.get();
  };
  const storageChanged = () => {
    const current = session.get();
    if (current !== sessionValue) { client.clear(); removeCache(); sessionValue = current; window.dispatchEvent(new Event("domo:session-changed")); }
  };
  window.addEventListener("domo:signed-out", signedOut);
  window.addEventListener("storage", storageChanged);
  return () => { unsubscribe(); clearTimeout(timer); window.removeEventListener("domo:signed-out", signedOut); window.removeEventListener("storage", storageChanged); };
}
