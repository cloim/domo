import { Capacitor } from "@capacitor/core";
import { Download, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "../../components/Dialogs.tsx";
import { signOut } from "../../lib/auth.ts";
import { checkForUpdate, currentAppVersion, fetchLatestRelease, openDownload, type ReleaseInfo } from "../../lib/update.ts";
import { useUpdatePrompt } from "../../UpdatePrompt.tsx";

export function AppSection() {
  const dialog = useDialog();
  const prompt = useUpdatePrompt();
  const native = Capacitor.isNativePlatform();
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [latest, setLatest] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    void currentAppVersion().then(setVersion);
    // 웹에서는 안드로이드 앱 설치 파일 링크를 보여주기 위해 최신 릴리스를 조회한다.
    if (!native) void fetchLatestRelease().then(setLatest).catch(() => {});
  }, [native]);

  async function check() {
    setChecking(true);
    try {
      const result = await checkForUpdate();
      if (result.hasUpdate && result.latest) prompt(result.latest);
      else await dialog.alert("최신 버전입니다", `현재 버전 ${result.current}이 최신입니다.`);
    } catch (err) {
      await dialog.alert("확인하지 못했습니다", (err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <section>
        <div className="section-head">
          <h2>버전</h2>
        </div>
        <ul className="list">
          <li>
            <span className="list-main">
              <strong className="num">{version ?? "확인 중"}</strong>
              <span>{native ? "안드로이드 앱" : "웹앱"}</span>
            </span>
            {native && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={checking} onClick={() => void check()}>
                <RefreshCw size={15} aria-hidden="true" /> {checking ? "확인 중" : "업데이트 확인"}
              </button>
            )}
          </li>
          {!native && latest?.apkUrl && (
            <li>
              <span className="list-main">
                <strong>안드로이드 앱</strong>
                <span className="num">최신 {latest.version}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openDownload(latest.apkUrl!)}>
                <Download size={15} aria-hidden="true" /> APK 받기
              </button>
            </li>
          )}
        </ul>
      </section>
      <section>
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
          <LogOut size={17} aria-hidden="true" /> 로그아웃
        </button>
      </section>
    </>
  );
}
