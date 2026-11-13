import { canEditTransaction, nowLocalDateTime, type Transaction } from "@domo/core";
import type { ColDef, GetRowIdParams, RowClickedEvent, SelectionChangedEvent } from "ag-grid-community";
import { Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import { TopBar } from "../../components/AppShell.tsx";
import { DataGrid } from "../../components/DataGrid/index.js";
import { Modal } from "../../components/Modal/index.js";
import { formatWon } from "../../lib/format.ts";
import { useHousehold, useSuggestions, useTransactions, type Me } from "../../lib/queries.ts";
import { EntryForm, type EntryPrefill } from "./EntryForm.tsx";
import { defaultReconciliationRange, reconciliationTransactions } from "./cardReconciliation.ts";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "../../components/DataGrid/data-grid.css";
import "./card-reconciliation.css";

const rowSelection = { mode: "multiRow" as const, enableClickSelection: false };
const selectionColumnDef = { width: 50, minWidth: 50, maxWidth: 50, resizable: false };
const getRowId = ({ data }: GetRowIdParams<Transaction>) => data.id;
type ReconciliationRow = Transaction & { paymentMethodName: string; memberName: string };

export function CardReconciliationPage() {
  const me = useOutletContext<Me>();
  const [range, setRange] = useState(defaultReconciliationRange);
  const [draft, setDraft] = useState(range);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ transaction: Transaction | null; prefill?: EntryPrefill } | null>(null);
  const household = useHousehold();
  const txs = useTransactions(range);
  const suggestions = useSuggestions();
  const data = household.data;
  const rows = useMemo<ReconciliationRow[]>(() => reconciliationTransactions(txs.data ?? [], data?.paymentMethods ?? [], range).map((t) => ({
    ...t,
    paymentMethodName: data?.paymentMethods.find((m) => m.id === t.paymentMethodId)?.name ?? "미지정",
    memberName: data?.members.find((m) => m.id === t.memberId)?.displayName ?? "",
  })), [txs.data, data, range]);
  const selected = rows.filter((t) => selectedIds.has(t.id));
  const canEdit = !editor?.transaction || !!data && canEditTransaction({ memberId: data.me.memberId, role: data.me.role }, editor.transaction);
  const columns = useMemo<(ColDef<ReconciliationRow> & { filterable?: boolean })[]>(() => [
    { colId: "paymentMethod", field: "paymentMethodName", headerName: "지출수단", width: 160, filterable: true, comparator: (a: string, b: string) => a.localeCompare(b, "ko") },
    { field: "occurredAt", headerName: "일시", width: 170, valueFormatter: ({ value }: { value: string }) => value?.replace("T", " ") ?? "" },
    { field: "counterparty", headerName: "지출처", width: 150, cellRenderer: ({ data: t }: { data: Transaction }) => <button type="button" className="reconciliation-edit" aria-label={`${t.counterparty} 내역 열기`} onClick={() => setEditor({ transaction: t })}>{t.counterparty}</button> },
    { field: "memo", headerName: "지출내용", width: 200 },
    { field: "amount", headerName: "금액", width: 140, cellClass: "reconciliation-amount num", valueFormatter: ({ value }: { value: number }) => `${formatWon(value)}원` },
    { field: "installmentMonths", headerName: "할부개월", width: 110, valueFormatter: ({ value }: { value: number }) => value > 1 ? `${value}개월` : "일시불" },
    { colId: "member", field: "memberName", headerName: "지출자", minWidth: 120, flex: 1 },
  ], []);
  const loading = txs.isPending || household.isPending;
  const error = txs.error ?? household.error;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.start || !draft.end || draft.start > draft.end) return;
    if (draft.start === range.start && draft.end === range.end) {
      void txs.refetch();
      void household.refetch();
    } else {
      setSelectedIds(new Set());
      setRange({ ...draft });
    }
  }

  return <>
    <TopBar title="카드내역 대사" me={me} actions={<span className="reconciliation-add"><button type="button" className="icon-btn" aria-label="누락 내역 등록" aria-describedby="reconciliation-add-tip" disabled={!data} onClick={() => setEditor({ transaction: null, prefill: { kind: "expense", amount: 0, counterparty: null, memo: null, occurredAt: nowLocalDateTime(), categoryId: null, paymentMethodId: data?.paymentMethods.find((m) => m.type === "card" && !m.archived)?.id ?? null } })}><Plus size={20} aria-hidden="true" /></button><span id="reconciliation-add-tip" role="tooltip">누락 내역 등록</span></span>} />
    <main className="reconciliation-page">
      <form className="reconciliation-filters" aria-label="대사 기간 조회" onSubmit={search}>
        <label className="field"><span className="field-label">시작일</span><input className="input" type="date" aria-label="시작일" required max={draft.end} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
        <label className="field"><span className="field-label">종료일</span><input className="input" type="date" aria-label="종료일" required min={draft.start} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
        <button type="submit" className="btn btn-primary" disabled={txs.isFetching || household.isFetching} aria-busy={txs.isFetching || household.isFetching}>{txs.isFetching || household.isFetching ? <Loader2 size={17} className="spin" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}조회</button>
      </form>
      <p className="reconciliation-note">모든 지출수단의 지출일과 전체 금액 기준입니다. 내역 행을 누르면 수정할 수 있어요.</p>
      <section className="reconciliation-grid" aria-label="대사 대상 지출 내역">
        <DataGrid key={`${range.start}:${range.end}`} rowData={error || loading ? [] : rows} columnDefs={columns} getRowId={getRowId} isLoading={loading} errorMessage={error?.message ?? ""} emptyMessage="조회 기간에 지출내역이 없습니다. 상단 + 버튼으로 누락 내역을 등록해 주세요." rowHeight={48} rowSelection={rowSelection} selectionColumnDef={selectionColumnDef} onSelectionChanged={({ api }: SelectionChangedEvent<ReconciliationRow>) => setSelectedIds(new Set(api.getSelectedRows().map((t) => t.id)))} onRowClicked={({ data: row, event }: RowClickedEvent<ReconciliationRow>) => {
          if (event?.target instanceof Element && event.target.closest('[col-id="ag-Grid-SelectionColumn"], .ag-selection-checkbox, .ag-checkbox-input-wrapper, button, input')) return;
          if (row) setEditor({ transaction: row });
        }} />
      </section>
      <footer className="reconciliation-summary" role="status" aria-live="polite">
        <span>{error || loading ? "내역 확인 중" : `전체 ${rows.length}건`}</span>
        <span>선택 {selected.length}건 <strong className="num">{formatWon(selected.reduce((sum, t) => sum + t.amount, 0))}원</strong></span>
      </footer>
    </main>
    {data && <Modal isOpen={!!editor} onClose={() => setEditor(null)} title={editor?.transaction ? (canEdit ? "내역 수정" : "내역 보기") : "누락 내역 등록"} size="md" className="reconciliation-modal">
      {editor && <EntryForm data={data} kind="expense" transaction={editor.transaction} prefill={editor.prefill} canEdit={canEdit} suggestions={suggestions.data ?? []} onDone={() => setEditor(null)} />}
    </Modal>}
  </>;
}
