import type { CardSettlement, YearMonth } from "@domo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../components/Modal/index.js";
import { api } from "../../lib/api.ts";
import { formatWon } from "../../lib/format.ts";

export function CardSettlementDialog({ month, onClose }: { month: YearMonth; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const preview = useQuery({ queryKey: ["settlements", month], queryFn: () => api<CardSettlement[]>(`/api/settlements/cards?month=${month}`) });
  const approve = useMutation({
    mutationFn: () => api<{ created: number }>("/api/settlements/cards", { method: "POST", body: { month, paymentMethodIds: selected } }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["transactions"] }), qc.invalidateQueries({ queryKey: ["household"] }), qc.invalidateQueries({ queryKey: ["settlements"] })]);
      onClose();
    },
  });
  const rows = preview.data ?? [];
  const eligible = rows.filter((r) => !r.recorded && !r.inProgress);
  const checked = eligible.filter((r) => selected.includes(r.paymentMethodId));
  return (
    <Modal isOpen onClose={() => !approve.isPending && onClose()} title={`${month} 카드 정산`} size="md"
      footer={<button type="button" className="btn btn-accent" disabled={approve.isPending || !checked.length || preview.isFetching || preview.isError} onClick={() => approve.mutate()}>
        {approve.isPending ? "기록 중…" : `${formatWon(checked.reduce((s, r) => s + r.amount, 0))}원 정산 기록`}
      </button>}>
      <p className="hint">선택한 카드대금을 결제일의 현금 지출로 기록해요. 출금 예정 기록이며 실제 납부 여부는 별도로 확인해 주세요.</p>
      <p className="hint">기존 카드대금 기록과 금액, 결제일이 다르면 먼저 내역을 확인해 주세요.</p>
      {preview.isPending ? <div className="skeleton" style={{ height: 100 }} /> : preview.isError ?
        <div role="alert"><p>{(preview.error as Error).message}</p><button type="button" className="btn btn-ghost" onClick={() => void preview.refetch()}>다시 시도</button></div> :
        rows.length === 0 ? <p>이 달에 정산할 신용카드 사용액이 없어요.</p> :
          <ul className="settlement-list">{rows.map((r) => <li key={r.paymentMethodId}>
            <label><input type="checkbox" disabled={r.recorded || r.inProgress || approve.isPending} checked={selected.includes(r.paymentMethodId)}
              onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, r.paymentMethodId] : ids.filter((id) => id !== r.paymentMethodId))} />
              <span><strong>{r.name}</strong><small>{r.usage.start} ~ {r.usage.end} 사용분</small><small>{r.paymentDate} 결제{r.recorded ? ", 기록됨" : r.inProgress ? ", 집계 중" : ""}</small></span>
              <strong className="num">{formatWon(r.amount)}원</strong>
            </label>
          </li>)}</ul>}
      {approve.isError && <p role="alert">{(approve.error as Error).message}</p>}
    </Modal>
  );
}
