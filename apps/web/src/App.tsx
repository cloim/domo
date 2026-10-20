import { App as CapApp } from "@capacitor/app";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { session } from "./lib/api.ts";
import { DomoNotify, notifySupported } from "./lib/notify.ts";
import { syncNotifyDevice } from "./lib/notifySync.ts";
import { useMe } from "./lib/queries.ts";
import { LoginPage } from "./pages/gate/LoginPage.tsx";
import { OnboardingPage } from "./pages/gate/OnboardingPage.tsx";
import { pendingInvite } from "./pages/gate/pendingInvite.ts";
import { RecordsPage } from "./pages/records/RecordsPage.tsx";
import { SettingsPage } from "./pages/settings/SettingsPage.tsx";
import logoUrl from "./assets/logo.svg";

// 차트 라이브러리는 통계 화면에서만 쓰므로 따로 불러온다.
const StatsPage = lazy(() => import("./pages/stats/StatsPage.tsx").then((m) => ({ default: m.StatsPage })));
const PlanPage = lazy(() => import("./pages/stats/PlanPage.tsx").then((m) => ({ default: m.PlanPage })));
const SearchPage = lazy(() => import("./pages/records/SearchPage.tsx").then((m) => ({ default: m.SearchPage })));
const FamilyPage = lazy(() => import("./pages/records/FamilyPage.tsx").then((m) => ({ default: m.FamilyPage })));

export function App() {
  const [signedIn, setSignedIn] = useState(() => !!session.get());
  const [accountVersion, setAccountVersion] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const onOut = () => setSignedIn(false);
    const onAccount = () => { setSignedIn(!!session.get()); setAccountVersion((n) => n + 1); };
    window.addEventListener("domo:signed-out", onOut);
    window.addEventListener("domo:session-changed", onAccount);
    return () => { window.removeEventListener("domo:signed-out", onOut); window.removeEventListener("domo:session-changed", onAccount); };
  }, []);

  return (
    <Routes>
      <Route path="/join" element={<JoinLink />} />
      {!signedIn ? (
        <Route
          path="*"
          element={
            <LoginPage
              onSignedIn={() => {
                setSignedIn(true);
                navigate("/", { replace: true });
              }}
            />
          }
        />
      ) : (
        <Route path="*" element={<SignedIn key={accountVersion} />} />
      )}
    </Routes>
  );
}

/** QR 링크 진입점. 코드를 맡겨두고 로그인 또는 합류 화면으로 보낸다. */
function JoinLink() {
  const [params] = useSearchParams();
  const code = params.get("code");
  if (code) pendingInvite.save(code);
  return <Navigate to="/onboarding" replace />;
}

function SignedIn() {
  const me = useMe(true);
  const location = useLocation();
  const navigate = useNavigate();

  // 등록 알림을 누르면 채워진 입력 화면으로 보낸다. 앱이 꺼져 있다가 열린 경우도 플러그인이 보관해 두었다가 전달한다.
  useEffect(() => {
    const open = (url?: string) => { if (url === "domo://records/new") navigate("/records?new=1"); };
    void CapApp.getLaunchUrl().then((value) => open(value?.url)).catch(() => {});
    const listener = CapApp.addListener("appUrlOpen", (event) => open(event.url));
    return () => void listener.then((h) => h.remove());
  }, [navigate]);
  useEffect(() => {
    if (!notifySupported) return;
    const handle = DomoNotify.addListener("prefill", (prefill) => navigate("/records", { state: { prefill } }));
    return () => void handle.then((h) => h.remove());
  }, [navigate]);

  // 앱을 열거나 돌아올 때 기기 등록, PC에서 바뀐 알림 설정 받기, 밀린 알림 올리기를 한다.
  const qc = useQueryClient();
  useEffect(() => {
    if (!notifySupported) return;
    const run = (uploadApps: boolean) =>
      syncNotifyDevice({ uploadApps })
        .then((changed) => {
          if (changed) void qc.invalidateQueries({ queryKey: ["notify"] });
        })
        .catch(() => {}); // 동기화 실패는 화면 사용을 막지 않는다. 다음에 다시 시도한다.
    void run(true);
    const resume = CapApp.addListener("resume", () => void run(false));
    return () => void resume.then((h) => h.remove());
  }, [qc]);

  if (me.isPending) return <Splash />;
  if (me.isError && !me.data) {
    return (
      <main className="gate">
        <div className="empty" role="alert">
          <strong>정보를 불러오지 못했어요</strong>
          <span>{me.error.message}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void me.refetch()}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }
  if (!me.data.member) {
    return location.pathname === "/onboarding" ? <OnboardingPage me={me.data} /> : <Navigate to="/onboarding" replace />;
  }
  if (pendingInvite.peek()) pendingInvite.clear();

  return (
    <Routes>
      <Route element={<AppShell me={me.data} />}>
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/stats" element={<Suspense fallback={null}><StatsPage /></Suspense>} />
        <Route path="/plan" element={<Suspense fallback={null}><PlanPage /></Suspense>} />
        <Route path="/search" element={<Suspense fallback={null}><SearchPage /></Suspense>} />
        <Route path="/family" element={<Suspense fallback={null}><FamilyPage /></Suspense>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/records" replace />} />
    </Routes>
  );
}

function Splash() {
  return (
    <main className="gate" aria-busy="true">
      <img src={logoUrl} alt="도모" width={56} height={56} style={{ opacity: 0.9 }} />
    </main>
  );
}
