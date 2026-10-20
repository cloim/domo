import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { session } from "./lib/api.ts";
import { useMe } from "./lib/queries.ts";
import { LoginPage } from "./pages/gate/LoginPage.tsx";
import { OnboardingPage } from "./pages/gate/OnboardingPage.tsx";
import { pendingInvite } from "./pages/gate/pendingInvite.ts";
import { RecordsPage } from "./pages/records/RecordsPage.tsx";
import { SettingsPage } from "./pages/settings/SettingsPage.tsx";

// 차트 라이브러리는 통계 화면에서만 쓰므로 따로 불러온다.
const StatsPage = lazy(() => import("./pages/stats/StatsPage.tsx").then((m) => ({ default: m.StatsPage })));

export function App() {
  const [signedIn, setSignedIn] = useState(() => !!session.get());
  const navigate = useNavigate();

  useEffect(() => {
    const onOut = () => setSignedIn(false);
    window.addEventListener("domo:signed-out", onOut);
    return () => window.removeEventListener("domo:signed-out", onOut);
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
        <Route path="*" element={<SignedIn />} />
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

  if (me.isPending) return <Splash />;
  if (me.isError) {
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
      <img src="/favicon.svg" alt="도모" width={56} height={56} style={{ borderRadius: 16, opacity: 0.9 }} />
    </main>
  );
}
