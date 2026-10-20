import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ current: "account-a" as string | null }));
vi.mock("./api.ts", () => ({ session: { get: () => identity.current } }));
import { installCache } from "./cache.ts";

let storage: Map<string, string>;
let clients: QueryClient[];
let disposers: (() => void)[];
beforeEach(() => {
  storage = new Map(); clients = []; disposers = []; identity.current = "account-a";
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => { for (const dispose of disposers) dispose(); for (const c of clients) c.clear(); vi.unstubAllGlobals(); });
async function client() { const c = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }); clients.push(c); disposers.push(await installCache(c)); return c; }
const key = "domo.query-cache.v1";

describe("기기 조회 캐시", () => {
  it("같은 계정은 조회를 복원하고 인증값과 가족 댓글은 캐시에 복제하지 않는다", async () => {
    const c = await client();
    c.setQueryData(["transactions", "2026-10-01", "2026-10-31"], [{ id: "my-record" }]);
    c.setQueryData(["family"], { privateComment: "가족 댓글" });
    await vi.waitFor(() => expect(storage.has(key)).toBe(true), { timeout: 2000 });
    expect(storage.get(key)).not.toContain("account-a"); expect(storage.get(key)).not.toContain("가족 댓글");
    const restored = await client(); expect(restored.getQueryData(["transactions", "2026-10-01", "2026-10-31"])).toEqual([{ id: "my-record" }]);
  });
  it("계정이 바뀌거나 24시간이 지나면 이전 계정 데이터를 복원하지 않는다", async () => {
    const c = await client(); c.setQueryData(["household"], { name: "우리집" });
    await vi.waitFor(() => expect(storage.has(key)).toBe(true), { timeout: 2000 });
    const saved = storage.get(key)!;
    identity.current = "account-b"; const other = await client(); expect(other.getQueryData(["household"])).toBeUndefined();
    identity.current = "account-a"; const stale = JSON.parse(saved); stale.at = Date.now() - 25 * 3600000; storage.set(key, JSON.stringify(stale));
    expect((await client()).getQueryData(["household"])).toBeUndefined();
  });
  it("로그아웃과 다른 탭의 계정 전환은 메모리와 기기 캐시를 지운다", async () => {
    const c = await client(); c.setQueryData(["household"], { name: "우리집" });
    identity.current = "account-b"; window.dispatchEvent(new Event("storage")); expect(c.getQueryData(["household"])).toBeUndefined();
    c.setQueryData(["household"], { name: "다른집" }); identity.current = null; window.dispatchEvent(new Event("domo:signed-out"));
    expect(c.getQueryCache().getAll()).toHaveLength(0); expect(storage.has(key)).toBe(false);
  });
  it("기기 저장소가 차단되어도 앱 초기화를 완료한다", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("저장소 접근 제한"); }, removeItem: () => { throw new Error("저장소 접근 제한"); } });
    expect(await client()).toBeInstanceOf(QueryClient);
  });
  it("재조회 실패 후에도 마지막 조회를 보존하고 조회 자체가 24시간 지난 데이터는 제외한다", async () => {
    const c = await client();
    c.setQueryData(["household"], { name: "오프라인 우리집" });
    c.setQueryData(["transactions", "old"], [], { updatedAt: Date.now() - 25 * 3600000 });
    await c.fetchQuery({ queryKey: ["household"], staleTime: 0, retry: false, queryFn: () => { throw new Error("서버 응답 없음"); } }).catch(() => {});
    await vi.waitFor(() => expect(storage.has(key)).toBe(true), { timeout: 2000 });
    const restored = await client();
    expect(restored.getQueryData(["household"])).toEqual({ name: "오프라인 우리집" });
    expect(restored.getQueryState(["household"])?.status).toBe("success");
    expect(restored.getQueryData(["transactions", "old"])).toBeUndefined();
  });
});
