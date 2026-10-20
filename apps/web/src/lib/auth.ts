import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { api, session } from "./api.ts";
import { DomoNotify } from "./notify.ts";

export interface AuthConfig {
  googleClientId: string | null;
  devLogin: boolean;
}

export const fetchAuthConfig = () => api<AuthConfig>("/api/auth/config");

async function exchange(path: string, body: unknown) {
  const { token } = await api<{ token: string }>(path, { method: "POST", body });
  session.set(token);
}

export const loginWithIdToken = (idToken: string) => exchange("/api/auth/google", { idToken });
export const loginDev = (email: string, name: string) => exchange("/api/auth/dev", { email, name });

/** 안드로이드 앱: Credential Manager로 구글 계정을 고르고 ID 토큰을 받는다. */
export async function nativeGoogleLogin(webClientId: string) {
  await SocialLogin.initialize({ google: { webClientId, mode: "online" } });
  const res = await SocialLogin.login({ provider: "google", options: {} });
  const idToken = res.result && "idToken" in res.result ? res.result.idToken : null;
  if (!idToken) throw new Error("구글 로그인 정보를 받지 못했습니다.");
  await loginWithIdToken(idToken);
}

export async function signOut() {
  session.clear();
  // 알림 감시 서비스가 로그아웃한 계정으로 업로드하지 않게 세션을 지운다.
  if (Capacitor.getPlatform() === "android") await DomoNotify.clearSync().catch(() => {});
  if (Capacitor.isNativePlatform()) await SocialLogin.logout({ provider: "google" }).catch(() => {});
  window.dispatchEvent(new Event("domo:signed-out"));
}

interface GoogleIdApi {
  initialize(options: { client_id: string; callback: (res: { credential: string }) => void; ux_mode?: string }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

/** 웹: Google Identity Services 버튼을 그린다. */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (window.google) return Promise.resolve(window.google.accounts.id);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve(window.google!.accounts.id);
    script.onerror = () => reject(new Error("구글 로그인 모듈을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}
