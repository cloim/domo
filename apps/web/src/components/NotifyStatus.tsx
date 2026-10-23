import { App as CapApp } from "@capacitor/app";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { notifySupported } from "../lib/notify.ts";
import { pendingKey, usePendingRegistrations } from "../lib/notifyPending.ts";
import { formatWon } from "../lib/format.ts";
import { Modal } from "./Modal/index.js";

/** 상단바 등록 대기함. 점 배지만으로 미처리 알림의 존재를 알린다. */
export function NotifyStatus() {
  const pending = usePendingRegistrations();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = pending.data ?? [];
  useEffect(() => {
    if (!notifySupported) return;
    const handle = CapApp.addListener("resume", () => void qc.invalidateQueries({ queryKey: pendingKey }));
    return () => void handle.then((h) => h.remove());
  }, [qc]);
  const label = items.length ? "등록 대기 알림 있음" : "등록 대기 알림";
  return <>
    <button type="button" className="icon-btn notify-status" aria-label={label} title={label} onClick={() => setOpen(true)}>
      <BellRing size={20} aria-hidden="true" />
      {items.length > 0 && <span className="status-dot" style={{ background: "var(--income)" }} aria-hidden="true" />}
    </button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="등록 대기" size="sm">
      {pending.isPending ? <span className="skeleton" style={{ display: "block", height: 96 }} aria-label="대기 알림 불러오는 중" /> : pending.isError ?
        <div className="readonly-note" role="alert"><p>대기 알림을 불러오지 못했어요.</p><button type="button" className="btn btn-ghost" onClick={() => void pending.refetch()}>다시 시도</button></div> :
        items.length === 0 ? <div className="md-empty">모든 알림을 처리했어요.</div> :
        <ul className="pending-notifications">{items.map((item) => <li key={item.id}>
          <button type="button" className="pending-notification" onClick={() => {
            setOpen(false);
            navigate("/records", { state: { prefill: { ...item.prefill, pendingId: item.id }, pending: item } });
          }}>
            <strong>{item.prefill.counterparty || "거래처 확인 필요"}<span className="num">{item.prefill.kind === "income" ? "수입" : "지출"} {formatWon(item.prefill.amount)}원</span></strong>
            <span className="hint">{item.prefill.occurredAt.replace("T", " ")}{item.deviceName ? ` | ${item.deviceName}` : ""}</span>
            {item.prefill.memo && <span>{item.prefill.memo}</span>}
          </button>
        </li>)}</ul>}
    </Modal>
  </>;
}
