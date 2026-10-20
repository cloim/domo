import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { isNewerVersion } from "@domo/core";

export const GITHUB_REPO = "cloim/domo";

export interface ReleaseInfo {
  version: string;
  notes: string;
  apkUrl: string | null;
  pageUrl: string;
}

export async function currentAppVersion(): Promise<string> {
  if (Capacitor.isNativePlatform()) return (await App.getInfo()).version;
  return __APP_VERSION__;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("업데이트 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const data = (await res.json()) as { tag_name: string; body: string | null; html_url: string; assets: { name: string; browser_download_url: string }[] };
  return {
    version: data.tag_name.replace(/^v/, ""),
    notes: data.body ?? "",
    apkUrl: data.assets.find((a) => a.name.endsWith(".apk"))?.browser_download_url ?? null,
    pageUrl: data.html_url,
  };
}

export async function checkForUpdate(): Promise<{ current: string; latest: ReleaseInfo | null; hasUpdate: boolean }> {
  const [current, latest] = await Promise.all([currentAppVersion(), fetchLatestRelease()]);
  return { current, latest, hasUpdate: !!latest && isNewerVersion(latest.version, current) };
}

/** APK는 시스템 브라우저로 내려받아 안드로이드 설치 화면으로 넘긴다. */
export async function openDownload(url: string) {
  if (Capacitor.isNativePlatform()) await Browser.open({ url });
  else window.open(url, "_blank", "noopener");
}
