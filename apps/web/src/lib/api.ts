import { Capacitor } from "@capacitor/core";

/** 앱(WebView)은 운영 서버를, 웹은 같은 출처를 호출한다. */
export const API_BASE = import.meta.env.VITE_API_BASE ?? (Capacitor.isNativePlatform() ? "https://domo.example.com" : "");

const TOKEN_KEY = "domo.session";

export const session = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (init.method && init.method !== "GET" && !navigator.onLine) throw new ApiError(0, "인터넷에 연결한 뒤 다시 저장해 주세요.");
  const token = session.get();
  let res: Response;
  const requestSession = session.get();
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.");
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && requestSession === session.get()) {
      session.clear();
      window.dispatchEvent(new Event("domo:signed-out"));
    }
    throw new ApiError(res.status, data?.message ?? "요청을 처리하지 못했습니다.");
  }
  return data as T;
}
