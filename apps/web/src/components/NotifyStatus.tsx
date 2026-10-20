import { App as CapApp } from "@capacitor/app";
import { useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, BellDot } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { notifyHealth, notifySupported, type NotifyHealth } from "../lib/notify.ts";
import { notifyKeys, useNotifyStatus } from "../pages/settings/notify/useNotify.ts";

const LABEL: Record<NotifyHealth, string> = {
  running: "알림 감시 동작 중",
  permission: "알림 감시: 권한 필요",
  idle: "알림 감시: 대상 앱이나 템플릿 없음",
  disconnected: "알림 감시: 연결 대기",
};
const COLOR: Record<NotifyHealth, string> = {
  running: "var(--income)",
  permission: "var(--danger)",
  idle: "var(--ink-3)",
  disconnected: "var(--series-3)",
};

/** 상단바의 알림 감시 서비스 상태. 안드로이드 앱에서만 보인다. */
export function NotifyStatus() {
  if (!notifySupported) return null;
  return <NotifyStatusButton />;
}

function NotifyStatusButton() {
  const status = useNotifyStatus();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // 시스템 설정에서 권한을 바꾸고 돌아오면 바로 다시 확인한다.
  useEffect(() => {
    const handle = CapApp.addListener("resume", () => void qc.invalidateQueries({ queryKey: notifyKeys.status }));
    return () => void handle.then((h) => h.remove());
  }, [qc]);

  if (!status.data) return null;
  const health = notifyHealth(status.data);
  const Icon = health === "running" ? BellRing : health === "permission" ? BellOff : BellDot;
  return (
    <button type="button" className="icon-btn notify-status" aria-label={LABEL[health]} title={LABEL[health]} onClick={() => navigate("/settings/notify")}>
      <Icon size={20} aria-hidden="true" />
      <span className="status-dot" style={{ background: COLOR[health] }} aria-hidden="true" />
    </button>
  );
}
