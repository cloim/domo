import type { CapturedNotification } from "../../../lib/notify.ts";

export function NotificationFields({ notification: n }: { notification: CapturedNotification }) {
  return <details>
    <summary className="hint">알림 원본 필드 보기</summary>
    {n.rawText == null && n.bigText == null && <p className="hint">이전 앱에서 받은 기록으로 원본 text와 bigText가 분리 수집되지 않았어요.</p>}
    <dl style={{ margin: "8px 0", fontSize: 12 }}>
      {[["title", n.title], ["text", n.rawText], ["bigText", n.bigText], ["body (표시 본문)", n.text]].map(([label, value]) => <div key={label}>
        <dt style={{ color: "var(--ink-2)", marginTop: 8 }}>{label}</dt><dd style={{ margin: "2px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value == null ? "미수집" : value || "비어 있음"}</dd>
      </div>)}
      <dt style={{ color: "var(--ink-2)", marginTop: 8 }}>수신 시각</dt><dd style={{ margin: "2px 0" }}>{new Date(n.postedAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })}</dd>
    </dl>
  </details>;
}
