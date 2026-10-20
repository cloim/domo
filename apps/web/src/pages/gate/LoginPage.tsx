import { Capacitor } from "@capacitor/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDialog } from "../../components/Dialogs.tsx";
import { fetchAuthConfig, loadGoogleIdentity, loginDev, loginWithIdToken, nativeGoogleLogin } from "../../lib/auth.ts";
import logoUrl from "../../assets/logo.svg";

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const dialog = useDialog();
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["auth-config"], queryFn: fetchAuthConfig, retry: 1 });
  const native = Capacitor.isNativePlatform();
  const googleSlot = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");

  async function finish(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      qc.clear();
      onSignedIn();
    } catch (err) {
      await dialog.alert("로그인하지 못했습니다", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const clientId = config.data?.googleClientId;
  useEffect(() => {
    if (native || !clientId || !googleSlot.current) return;
    const slot = googleSlot.current;
    loadGoogleIdentity()
      .then((gis) => {
        gis.initialize({ client_id: clientId, callback: ({ credential }) => void finish(() => loginWithIdToken(credential)) });
        gis.renderButton(slot, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 320, locale: "ko" });
      })
      .catch((err: Error) => void dialog.alert("구글 로그인 준비 실패", err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, native]);

  function submitDev(e: FormEvent) {
    e.preventDefault();
    void finish(() => loginDev(devEmail.trim(), devName.trim() || devEmail.split("@")[0]!));
  }

  return (
    <main className="gate">
      <div className="gate-card">
        <div className="gate-brand">
          <img src={logoUrl} alt="" />
          도모
        </div>
        <h1>
          가족이 함께 쓰는
          <br />
          우리 집 가계부
        </h1>
        <p>지출과 수입을 함께 적고, 한눈에 살펴보세요.</p>

        {config.isPending ? (
          <span className="skeleton" style={{ display: "block", height: 44 }} />
        ) : config.isError ? (
          <div className="empty" role="alert" style={{ padding: 24 }}>
            <strong>서버에 연결하지 못했어요</strong>
            <button type="button" className="btn btn-ghost" onClick={() => void config.refetch()}>
              다시 시도
            </button>
          </div>
        ) : (
          <div className="gate-stack">
            {clientId &&
              (native ? (
                <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void finish(() => nativeGoogleLogin(clientId))}>
                  <GoogleMark /> Google로 계속하기
                </button>
              ) : (
                <div ref={googleSlot} className="google-slot" />
              ))}
            {config.data.devLogin && (
              <>
                {clientId && <div className="divider">개발용 로그인</div>}
                <form className="gate-stack" onSubmit={submitDev}>
                  <input className="input" type="email" required placeholder="이메일" aria-label="이메일" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} />
                  <input className="input" placeholder="이름" aria-label="이름" value={devName} onChange={(e) => setDevName(e.target.value)} />
                  <button type="submit" className="btn btn-ghost btn-block" disabled={busy || !devEmail}>
                    개발용으로 로그인
                  </button>
                </form>
              </>
            )}
            {!clientId && !config.data.devLogin && <p role="alert">구글 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.</p>}
          </div>
        )}
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
