import { budgetProgress, currentYearMonth, forecastMonth, nowLocalDateTime, type YearMonth } from "@domo/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { TopBar } from "../../components/AppShell.tsx";
import { MonthSwitch } from "../../components/MonthSwitch.tsx";
import { useDialog } from "../../components/Dialogs.tsx";
import SelectControl from "../../components/SelectControl/SelectControl.tsx";
import { api } from "../../lib/api.ts";
import { useAllTransactions, useBudgets, useRecurring } from "../../lib/family.ts";
import { formatWon } from "../../lib/format.ts";
import { useHousehold, type Me } from "../../lib/queries.ts";

export function PlanPage() {
  const me = useOutletContext<Me>();
  const household = useHousehold();
  const txs = useAllTransactions();
  const recurring = useRecurring();
  const [params, setParams] = useSearchParams();
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.get("m") ?? "") ? params.get("m") as YearMonth : currentYearMonth();
  const setMonth = (m: YearMonth) => setParams({ m }, { replace: true });
  const budgets = useBudgets(month);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const qc = useQueryClient();
  const dialog = useDialog();
  const save = useMutation({ networkMode: "always", mutationFn: (input: { month: YearMonth; categoryId: string; amount: number }) => api("/api/budgets", { method: "PUT", body: input }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["budgets"] }); void api("/api/budgets/check", { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["family"] })).catch(() => {}); } });
  const data = household.data;
  const forecast = useMemo(() => data && txs.data && recurring.data ? forecastMonth(txs.data, recurring.data, data.categories, data.paymentMethods, month, nowLocalDateTime().slice(0, 10)) : null, [data, txs.data, recurring.data, month]);
  const progress = useMemo(() => data && txs.data ? budgetProgress(budgets.data ?? [], txs.data, data.categories, data.paymentMethods, month) : [], [data, txs.data, budgets.data, month]);
  const parents = data?.categories.filter((c) => c.kind === "expense" && !c.parentId && !c.archived) ?? [];
  async function submit(e: FormEvent) {
    e.preventDefault();
    try { await save.mutateAsync({ month, categoryId, amount: Number(amount) }); setAmount(""); setCategoryId(""); }
    catch (err) { await dialog.alert("예산 저장", (err as Error).message); }
  }
  const failed = [household, txs, recurring, budgets].find((q) => q.isError && !q.data);
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const first = new Date(`${month}-01T12:00:00`).getDay();
  return <><TopBar title="생활비 계획" me={me} /><div className="content"><div className="page plan-page">
    <MonthSwitch value={month} onChange={(m) => { setMonth(m); setDay(null); setCategoryId(""); setAmount(""); }} />
    {failed ? <div className="empty" role="alert"><strong>{failed.error?.message}</strong><button className="btn" onClick={() => void failed.refetch()}>다시 시도</button></div> : !forecast || budgets.isPending ? <div className="skeleton" style={{ height: 250 }} /> : <>
      <section className="forecast-head"><span>월말 예상 잔액</span><strong className="num">{formatWon(forecast.balance)}<small>원</small></strong><p>월 수입에서 기록된 실지출과 미반영 예정 지출 {formatWon(forecast.pending)}원을 뺀 금액입니다. 계좌 잔고와는 다릅니다.</p><p>변동 생활비와 미등록 수입은 포함하지 않아요.</p>{forecast.missingCards.length > 0 && <Link to="/settings/payment-methods">{forecast.missingCards.join(", ")}: 결제 정보를 채우면 예측에 포함됩니다.</Link>}</section>
      <div className="plan-grid"><section className="panel"><h2>출금 달력</h2><div className="calendar-grid flow-calendar">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d} className="calendar-weekday">{d}</span>)}{Array.from({ length: first }, (_, i) => <span key={`space:${i}`} />)}
        {Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; const events = forecast.events.filter((e) => e.date === date); const total = events.reduce((s, e) => s + e.amount, 0); return <button key={date} type="button" aria-pressed={day === date} aria-label={`${date}, 출금 ${formatWon(total)}원, ${events.length}건`} onClick={() => setDay(day === date ? null : date)}><span>{i + 1}</span>{total > 0 && <><i /><small>{formatWon(total)}</small></>}</button>; })}
      </div><div className="flow-events" aria-live="polite">{forecast.events.filter((e) => !day || e.date === day).map((e) => <div key={e.key}><time>{e.date.slice(5)}</time><span>{e.label}<small>{e.estimated ? "예정" : "기록됨"}</small></span><strong className="num">{formatWon(e.amount)}원</strong></div>)}{forecast.events.filter((e) => !day || e.date === day).length === 0 && <p className="muted">{day ? "이 날짜에 예정된 출금이 없어요." : "이달에 추가로 예정된 출금이 없어요."}</p>}</div></section>
      <section className="panel budgets-panel"><h2>분류별 예산</h2><p className="muted">사용 기준으로 집계해요. 80%에 도달하면 가족 소식에 알려드립니다.</p>
        {!progress.length && <p className="empty">첫 예산을 정해 보세요.</p>}
        {progress.map((b) => <button type="button" key={b.categoryId} className="budget-item" onClick={() => { setCategoryId(b.categoryId); setAmount(String(b.amount)); }}><span><strong>{data?.categories.find((c) => c.id === b.categoryId)?.name}</strong><b className={b.ratio >= 0.8 ? "budget-warning num" : "num"}>{Math.round(b.ratio * 100)}%</b></span><progress value={Math.min(b.spent, b.amount)} max={b.amount} aria-label={`${data?.categories.find((c) => c.id === b.categoryId)?.name} 예산 사용률`} /><span className="num"><small>{formatWon(b.spent)}원 사용</small><small>{formatWon(b.amount)}원 예산</small></span></button>)}
        <form className="budget-form" onSubmit={(e) => void submit(e)}><label className="field">지출 대분류<SelectControl aria-label="지출 대분류" required value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setAmount(String(budgets.data?.find((b) => b.categoryId === e.target.value)?.amount ?? "")); }}><option value="">분류 선택</option>{parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectControl></label><label className="field">월 예산(원)<input required className="input" type="number" min="0" max="10000000000" step="1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><small className="muted">0원을 저장하면 해당 예산을 해제합니다.</small><button className="btn btn-accent" disabled={save.isPending}>{save.isPending ? "저장 중…" : "예산 저장"}</button></form>
      </section></div>
    </>}
  </div></div></>;
}


