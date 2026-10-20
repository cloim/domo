import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { Capacitor } from "@capacitor/core";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Crown, QrCode, ScanLine, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useDialog } from "../../components/Dialogs.tsx";
import { api } from "../../lib/api.ts";
import { signOut } from "../../lib/auth.ts";
import { keys, type Me } from "../../lib/queries.ts";
import { pendingInvite } from "./pendingInvite.ts";

type Step = "choose" | "owner" | "member";

/** QR에는 초대 링크가 들어 있다. 코드만 입력해도 받아준다. */
export function extractInviteCode(raw: string): string {
  const trimmed = raw.trim();
  try {
    return new URL(trimmed).searchParams.get("code")?.toUpperCase() ?? "";
  } catch {
    return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
}

export function OnboardingPage({ me }: { me: Me }) {
  const dialog = useDialog();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(() => (pendingInvite.peek() ? "member" : "choose"));
  const [name, setName] = useState(`${me.user.name}네 가계`);
  const [code, setCode] = useState(() => pendingInvite.peek() ?? "");
  const [preview, setPreview] = useState<{ code: string; householdName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const native = Capacitor.isNativePlatform();

  async function run(title: string, action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      await dialog.alert(title, (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const enter = async () => {
    pendingInvite.clear();
    await qc.invalidateQueries({ queryKey: keys.me });
    navigate("/records", { replace: true });
  };

  const lookup = (value: string) =>
    run("초대를 확인하지 못했습니다", async () => {
      const c = extractInviteCode(value);
      if (c.length < 4) throw new Error("초대 코드를 다시 확인해 주세요.");
      const { householdName } = await api<{ householdName: string }>(`/api/invites/${c}/preview`);
      setPreview({ code: c, householdName });
    });

  // 초대 링크로 들어온 경우 바로 초대 내용을 보여준다.
  useEffect(() => {
    const c = pendingInvite.peek();
    if (c) void lookup(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scan = () =>
    run("QR을 스캔하지 못했습니다", async () => {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        throw new Error("스캐너 구성요소를 설치하고 있어요. 잠시 후 다시 눌러 주세요.");
      }
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      const raw = barcodes[0]?.rawValue;
      if (!raw) return;
      setCode(extractInviteCode(raw));
      await lookup(raw);
    });

  function createHousehold(e: FormEvent) {
    e.preventDefault();
    void run("가계를 만들지 못했습니다", async () => {
      await api("/api/households", { method: "POST", body: { name: name.trim() } });
      await enter();
    });
  }

  const join = () =>
    run("합류하지 못했습니다", async () => {
      await api("/api/join", { method: "POST", body: { code: preview!.code } });
      await enter();
    });

  return (
    <main className="gate">
      <div className="gate-card">
        {step === "choose" ? (
          <>
            <h1>{me.user.name}님, 어떻게 시작할까요?</h1>
            <p>가계를 새로 만들거나, 가족이 만든 가계에 합류할 수 있어요.</p>
            <div className="gate-stack">
              <button type="button" className="choice" onClick={() => setStep("owner")}>
                <span className="choice-icon">
                  <Crown size={22} aria-hidden="true" />
                </span>
                <span>
                  <strong>대표자로 시작</strong>
                  <span>새 가계를 만들고 가족을 초대합니다</span>
                </span>
              </button>
              <button type="button" className="choice" onClick={() => setStep("member")}>
                <span className="choice-icon">
                  <UserPlus size={22} aria-hidden="true" />
                </span>
                <span>
                  <strong>구성원으로 시작</strong>
                  <span>대표자가 보여주는 초대 QR로 합류합니다</span>
                </span>
              </button>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 24 }} onClick={() => void signOut()}>
              다른 계정으로 로그인
            </button>
          </>
        ) : (
          <>
            <button type="button" className="back-link" onClick={() => (preview ? setPreview(null) : setStep("choose"))}>
              <ChevronLeft size={16} aria-hidden="true" /> 이전
            </button>
            {step === "owner" ? (
              <form onSubmit={createHousehold}>
                <h1>가계 이름을 정해 주세요</h1>
                <p>가족 모두에게 보이는 이름이에요. 나중에 설정에서 바꿀 수 있어요.</p>
                <div className="gate-stack">
                  <input className="input" aria-label="가계 이름" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  <button type="submit" className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
                    가계 만들기
                  </button>
                </div>
              </form>
            ) : preview ? (
              <>
                <h1>{preview.householdName}에 합류할까요?</h1>
                <p>합류하면 가족과 함께 기록을 보고 적을 수 있어요.</p>
                <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void join()}>
                  합류하기
                </button>
              </>
            ) : (
              <>
                <h1>초대 QR을 스캔해 주세요</h1>
                <p>대표자의 도모 설정 화면 중 구성원 초대에서 QR을 보여달라고 해 주세요.</p>
                <div className="gate-stack">
                  {native ? (
                    <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void scan()}>
                      <ScanLine size={18} aria-hidden="true" /> QR 스캔
                    </button>
                  ) : (
                    <p style={{ display: "flex", gap: 8, margin: 0, fontSize: 14 }}>
                      <QrCode size={18} aria-hidden="true" style={{ flex: "none" }} /> 휴대폰 카메라로 QR을 비추면 초대 링크가 열립니다. 코드를 직접 입력해도 돼요.
                    </p>
                  )}
                  <div className="divider">또는 초대 코드 입력</div>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void lookup(code);
                    }}
                  >
                    <input className="input num" aria-label="초대 코드" placeholder="예: K7PM2QXA" maxLength={32} autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
                    <button type="submit" className="btn btn-ghost" disabled={busy || code.trim().length < 4}>
                      확인
                    </button>
                  </form>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
