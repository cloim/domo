import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { canEditTransaction, type Transaction } from "@domo/core";
import { TopBar } from "../../components/AppShell.tsx";
import SelectControl from "../../components/SelectControl/SelectControl.tsx";
import { useAllTransactions } from "../../lib/family.ts";
import { formatWon } from "../../lib/format.ts";
import { useHousehold, useSuggestions, type Me } from "../../lib/queries.ts";
import { EntrySheet } from "./EntryForm.tsx";

export function SearchPage() {
  const me = useOutletContext<Me>();
  const txs = useAllTransactions();
  const household = useHousehold();
  const suggestions = useSuggestions();
  const [text, setText] = useState("");
  const [member, setMember] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const results = useMemo(() => (txs.data ?? []).filter((t) =>
    `${t.counterparty} ${t.memo ?? ""}`.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase()) &&
    (!member || t.memberId === member) && (!min || t.amount >= Number(min)) && (!max || t.amount <= Number(max))), [txs.data, text, member, min, max]);
  const reset = () => setLimit(50);
  return <><TopBar title="기록 검색" parent={{ to: "/records", label: "입출기록" }} me={me} />
    <div className="content"><div className="page search-page">
      <div className="search-filters">
        <label className="field"><span className="search-filter-title">거래처와 메모</span><input autoFocus type="search" className="input" value={text} onChange={(e) => { setText(e.target.value); reset(); }} placeholder="전체 기간에서 검색" /></label>
        <label className="field"><span className="search-filter-title">구성원</span><SelectControl aria-label="구성원" value={member} onChange={(e) => { setMember(e.target.value); reset(); }}><option value="">전체</option>{household.data?.members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</SelectControl></label>
        <label className="field"><span className="search-filter-title">최소 금액</span><input className="input" inputMode="numeric" type="number" min="0" value={min} onChange={(e) => { setMin(e.target.value); reset(); }} /></label>
        <label className="field"><span className="search-filter-title">최대 금액</span><input className="input" inputMode="numeric" type="number" min={min || 0} value={max} onChange={(e) => { setMax(e.target.value); reset(); }} /></label>
      </div>
      <p className="muted" role="status">원거래 {results.length}건, 금액은 할부 전체 금액 기준입니다.</p>
      {Number(min) > Number(max) && max && <p role="alert">최대 금액을 최소 금액 이상으로 입력해 주세요.</p>}
      {txs.isPending ? <div className="skeleton" style={{ height: 200 }} /> : txs.isError ? <div className="empty" role="alert"><strong>{txs.error.message}</strong><button className="btn" onClick={() => void txs.refetch()}>다시 시도</button></div> : !results.length ? <div className="empty"><strong>검색 조건에 맞는 기록이 없어요</strong><button className="btn btn-ghost" onClick={() => { setText(""); setMember(""); setMin(""); setMax(""); }}>조건 초기화</button></div> : <div className="search-results">
        {results.slice(0, limit).map((t) => <button key={t.id} type="button" className="search-result" onClick={() => setSelected(t)}>
          <time>{t.occurredAt.slice(0, 10)}</time><span><strong>{t.counterparty}</strong>{t.memo && <small>{t.memo}</small>}<small>{household.data?.members.find((m) => m.id === t.memberId)?.displayName}{t.installmentMonths > 1 ? ` | ${t.installmentMonths}개월 할부` : ""}</small></span><strong className={`num ${t.kind}`}>{t.kind === "income" ? "+" : ""}{formatWon(t.amount)}원</strong>
        </button>)}
        {results.length > limit && <button className="btn btn-ghost" onClick={() => setLimit((n) => n + 50)}>50건 더 보기</button>}
      </div>}
    </div></div>
    {household.data && <EntrySheet open={!!selected} onClose={() => setSelected(null)} title={selected ? (canEditTransaction({ memberId: household.data.me.memberId, role: household.data.me.role }, selected) ? "기록 수정" : "기록 보기") : "기록 상세"} data={household.data} kind={selected?.kind ?? "expense"} transaction={selected} canEdit={!!selected && canEditTransaction({ memberId: household.data.me.memberId, role: household.data.me.role }, selected)} suggestions={suggestions.data ?? []} onDone={() => setSelected(null)} />}
    </>;
}
