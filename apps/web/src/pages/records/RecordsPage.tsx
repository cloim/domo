import {
  canEditTransaction,
  currentYearMonth,
  expandEntries,
  groupByDay,
  monthRange,
  summarizeEntries,
  isCheckCardPayment,
  type LedgerEntry,
  type Transaction,
  type TransactionKind,
  type YearMonth,
} from "@domo/core";
import { CreditCard, NotebookPen, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router";
import { TopBar } from "../../components/AppShell.tsx";
import { MonthSwitch } from "../../components/MonthSwitch.tsx";
import { Sheet } from "../../components/Sheet.tsx";
import { formatTime, formatWon, isWeekend, weekdayOf } from "../../lib/format.ts";
import { useHousehold, useTransactions, type HouseholdData, type Me } from "../../lib/queries.ts";
import { useMedia, WIDE_EDITOR } from "../../lib/useMedia.ts";
import { EntryForm, type EntryPrefill, type Suggestion } from "./EntryForm.tsx";
import { CardSettlementDialog } from "./CardSettlementDialog.tsx";

const KINDS: { kind: TransactionKind; label: string }[] = [
  { kind: "expense", label: "지출" },
  { kind: "income", label: "수입" },
];

export function RecordsPage() {
  const me = useOutletContext<Me>();
  const [params, setParams] = useSearchParams();
  const month = (params.get("m") as YearMonth | null) ?? currentYearMonth();
  const kind: TransactionKind = params.get("tab") === "income" ? "income" : "expense";
  const range = useMemo(() => monthRange(month), [month]);

  const household = useHousehold();
  const txs = useTransactions(range);
  const wide = useMedia(WIDE_EDITOR);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<EntryPrefill | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // 등록 알림을 눌러 들어오면 그 달과 탭으로 옮기고 채워진 입력 화면을 연다.
  useEffect(() => {
    const incoming = (location.state as { prefill?: EntryPrefill } | null)?.prefill;
    if (!incoming) return;
    setPrefill(incoming);
    setSelectedId(null);
    if (!wide) setSheetOpen(true);
    const p = new URLSearchParams(params);
    p.set("m", incoming.occurredAt.slice(0, 7));
    p.set("tab", incoming.kind);
    navigate({ pathname: location.pathname, search: p.toString() }, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const entries = useMemo(() => expandEntries(txs.data ?? [], range), [txs.data, range]);
  const totals = useMemo(() => summarizeEntries(entries, household.data ?? { categories: [], paymentMethods: [] }), [entries, household.data]);
  const groups = useMemo(() => groupByDay(entries.filter((e) => e.transaction.kind === kind)), [entries, kind]);
  const suggestions = useMemo<Suggestion[]>(() => {
    const seen = new Map<string, Suggestion>();
    for (const t of [...(txs.data ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))) {
      if (!seen.has(t.counterparty)) seen.set(t.counterparty, { counterparty: t.counterparty, categoryId: t.categoryId, paymentMethodId: t.paymentMethodId });
    }
    return [...seen.values()];
  }, [txs.data]);

  const selected = (txs.data ?? []).find((t) => t.id === selectedId) ?? null;

  const update = (next: { m?: YearMonth; tab?: TransactionKind }) => {
    const p = new URLSearchParams(params);
    if (next.m) p.set("m", next.m);
    if (next.tab) p.set("tab", next.tab);
    setParams(p, { replace: true });
  };

  // 달이나 탭을 바꾸면 고르던 기록을 놓는다.
  useEffect(() => setSelectedId(null), [month, kind]);

  function openEntry(id: string | null) {
    setPrefill(null);
    setSelectedId(id);
    if (!wide) setSheetOpen(true);
  }

  function onDone(saved: Transaction | null) {
    setPrefill(null);
    setSheetOpen(false);
    setSelectedId(null);
    if (saved) {
      setFlashId(saved.id);
      // 저장한 기록이 다른 달이나 탭이면 그 위치로 옮겨 결과를 바로 보여준다.
      const savedMonth = saved.occurredAt.slice(0, 7) as YearMonth;
      if (savedMonth !== month || saved.kind !== kind) update({ m: savedMonth, tab: saved.kind });
    }
  }

  const data = household.data;
  const canEdit = (t: Transaction | null) => !t || !data || canEditTransaction({ memberId: data.me.memberId, role: data.me.role }, t);
  const form = data && (
    <EntryForm data={data} kind={kind} transaction={selected} prefill={selected ? null : prefill} canEdit={canEdit(selected)} suggestions={suggestions} onDone={onDone} />
  );
  const formTitle = selected ? (canEdit(selected) ? "기록 수정" : "기록 보기") : "새 기록";

  return (
    <>
      <TopBar title="입출기록" me={me} actions={<button type="button" className="icon-btn" title="카드 정산" aria-label="카드 정산" onClick={() => setSettlementOpen(true)}><CreditCard size={20} aria-hidden="true" /></button>} />
      <div className="content">
        <div className="records">
          <section className="ledger" aria-label="입출 내역">
            <div className="ledger-inner">
              <div className="ledger-head">
                <MonthSwitch value={month} onChange={(m) => update({ m })} />
                <div className="kind-tabs" role="tablist" aria-label="지출과 수입">
                  {KINDS.map((k) => (
                    <button
                      key={k.kind}
                      type="button"
                      role="tab"
                      className={`kind-tab ${k.kind}`}
                      aria-selected={kind === k.kind}
                      onClick={() => update({ tab: k.kind })}
                    >
                      <span className="kind-tab-label">{k.label}</span>
                      {txs.isPending ? (
                        <span className="skeleton" style={{ width: 120, height: 28, marginTop: 2 }} />
                      ) : (
                        <span className="kind-tab-amount num">
                          {formatWon(totals[k.kind])}
                          <small>원</small>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="cash-summary" aria-label="출금 기준 월 요약">
                  {txs.isPending || !data ? <span className="skeleton" style={{ height: 28, width: "100%" }} /> : <>
                    <span>실지출 <strong className="num">{formatWon(totals.realExpense)}원</strong></span>
                    <span>월 잔액 <strong className="num">{formatWon(totals.balance)}원</strong></span>
                  </>}
                </div>
              </div>

              {txs.isPending || !data ? (
                <LedgerSkeleton />
              ) : txs.isError ? (
                <div className="empty" role="alert">
                  <strong>내역을 불러오지 못했어요</strong>
                  <span>{(txs.error as Error).message}</span>
                  <button type="button" className="btn btn-ghost" onClick={() => void txs.refetch()}>
                    다시 시도
                  </button>
                </div>
              ) : groups.length === 0 ? (
                <div className="empty">
                  <NotebookPen size={28} aria-hidden="true" />
                  <strong>이 달의 {kind === "expense" ? "지출" : "수입"} 기록이 없어요</strong>
                  {!wide && (
                    <button type="button" className="btn btn-accent" onClick={() => openEntry(null)}>
                      <Plus size={18} aria-hidden="true" /> 기록 추가
                    </button>
                  )}
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.date} className="day">
                    <div className={`day-date${isWeekend(g.date) ? " weekend" : ""}`}>
                      <span className="day-num num">{Number(g.date.slice(8))}</span>
                      <span className="day-week">{weekdayOf(g.date)}</span>
                    </div>
                    <div className="day-body">
                      {g.entries.map((e) => (
                        <EntryRow key={e.key} entry={e} data={data} current={e.transaction.id === selectedId} flash={e.transaction.id === flashId} onOpen={() => openEntry(e.transaction.id)} />
                      ))}
                      {g.entries.length > 1 && (
                        <div className="day-total num">
                          {kind === "income" ? `${formatWon(g.total)}원` : <>
                            사용 {formatWon(summarizeEntries(g.entries, data).expense)}원
                            {" | "}출금 {formatWon(summarizeEntries(g.entries, data).realExpense)}원
                          </>}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside className="editor-panel" aria-label={formTitle}>
            <div className="editor-head">
              <h2>{formTitle}</h2>
              {selected && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>
                  <Plus size={15} aria-hidden="true" /> 새 기록
                </button>
              )}
            </div>
            {wide && form}
          </aside>
        </div>
      </div>

      <button type="button" className="fab" aria-label="기록 추가" onClick={() => openEntry(null)}>
        <Plus size={28} aria-hidden="true" />
      </button>
      <Sheet open={!wide && sheetOpen} title={formTitle} onClose={() => setSheetOpen(false)}>
        {form}
      </Sheet>
      {settlementOpen && <CardSettlementDialog key={month} month={month} onClose={() => setSettlementOpen(false)} />}
    </>
  );
}

function EntryRow({ entry, data, current, flash, onOpen }: { entry: LedgerEntry; data: HouseholdData; current: boolean; flash: boolean; onOpen: () => void }) {
  const t = entry.transaction;
  const category = data.categories.find((c) => c.id === t.categoryId);
  const member = data.members.find((m) => m.id === t.memberId);
  const method = data.paymentMethods.find((m) => m.id === t.paymentMethodId);
  return (
    <button type="button" className={`entry${flash ? " entry-flash" : ""}`} aria-current={current} onClick={onOpen}>
      {member && <span className="dot" style={{ background: member.color }} title={member.displayName} aria-label={member.displayName} />}
      <span className="entry-main">
        <span className="entry-title">
          {t.counterparty}
          {t.recurringId && <span className="badge" style={{ marginLeft: 6, verticalAlign: 2 }}>고정</span>}
          {isCheckCardPayment(t, data) && <span className="badge" title="체크카드는 사용 시 출금되어 카드대금을 지출 합계에서 제외합니다." style={{ marginLeft: 6, verticalAlign: 2 }}>중복 정산 제외</span>}
        </span>
        <span className="entry-meta">
          {t.memo ? <span className="entry-memo">{t.memo}</span> : <span>{category?.name ?? "미분류"}</span>}
          <span className="sep" aria-hidden="true" />
          <span>{method ? method.name : formatTime(entry.occurredAt)}</span>
        </span>
      </span>
      <span className={`entry-amount num ${t.kind}`}>
        {t.kind === "income" ? "+" : ""}
        {formatWon(entry.amount)}
        {entry.installment && (
          <small>
            할부 {entry.installment.index}/{entry.installment.total}
          </small>
        )}
      </span>
    </button>
  );
}

function LedgerSkeleton() {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      {[0, 1, 2].map((i) => (
        <div key={i} className="day">
          <div className="day-date">
            <span className="skeleton" style={{ display: "block", width: 30, height: 26, margin: "0 auto" }} />
          </div>
          <div className="day-body" style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
            {[0, 1].map((j) => (
              <span key={j} className="skeleton" style={{ height: 36 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
