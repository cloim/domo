import { currentYearMonth, type Transaction, type YearMonth } from "@domo/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router";
import { TopBar } from "../../components/AppShell.tsx";
import { MonthSwitch } from "../../components/MonthSwitch.tsx";
import { useDialog } from "../../components/Dialogs.tsx";
import { api } from "../../lib/api.ts";
import { useFamily, type FamilyData } from "../../lib/family.ts";
import { formatWon } from "../../lib/format.ts";
import { useHousehold, type HouseholdData, type Me } from "../../lib/queries.ts";

export function FamilyPage() {
  const me = useOutletContext<Me>();
  const household = useHousehold();
  const [month, setMonth] = useState<YearMonth>(currentYearMonth());
  const feed = useFamily(month);
  return <><TopBar title="가족 소식" me={me} /><div className="content"><div className="page family-page">
    <div className="family-month"><MonthSwitch value={month} onChange={setMonth} /></div>
    {feed.isPending || household.isPending ? <div className="skeleton" style={{ height: 240 }} /> : !feed.data || !household.data ? <div className="empty" role="alert"><strong>소식을 불러오지 못했어요</strong><button className="btn" onClick={() => { void feed.refetch(); void household.refetch(); }}>다시 시도</button></div> : <>
      {feed.data.alerts.length > 0 && <section className="budget-notices" aria-label="예산 알림">{feed.data.alerts.map((a) => <Link to={`/plan?m=${a.month}`} key={a.id}><strong>{a.month} {household.data.categories.find((c) => c.id === a.categoryId)?.name} 예산 80% 도달</strong><span>당시 {formatWon(a.amount)}원 중 {formatWon(a.spent)}원 사용</span></Link>)}</section>}
      {!feed.data.records.length && <div className="empty"><MessageCircle aria-hidden="true" /><strong>첫 기록으로 가족에게 소식을 전해 보세요</strong><Link className="btn btn-accent" to="/records?new=1">기록 추가</Link></div>}
      {feed.data.records.map((t) => <FamilyRecord key={t.id} tx={t} feed={feed.data} household={household.data!} />)}
    </>}
  </div></div></>;
}

function FamilyRecord({ tx, feed, household }: { tx: Transaction & { createdAt: string }; feed: FamilyData; household: HouseholdData }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const dialog = useDialog();
  const change = useMutation({ networkMode: "always", mutationFn: ({ path, method, body: payload }: { path: string; method: string; body?: unknown }) => api(path, { method, body: payload }), onSuccess: () => qc.invalidateQueries({ queryKey: ["family"] }) });
  const member = household.members.find((m) => m.id === tx.memberId);
  const comments = feed.comments.filter((c) => c.transactionId === tx.id);
  const reactions = feed.reactions.filter((r) => r.transactionId === tx.id);
  const mine = reactions.find((r) => r.memberId === household.me.memberId)?.reaction;
  async function act(path: string, method: string, payload?: unknown) {
    try { await change.mutateAsync({ path, method, body: payload }); return true; }
    catch (err) { await dialog.alert("가족 소식", (err as Error).message); return false; }
  }
  async function comment(e: FormEvent) {
    e.preventDefault();
    if (await act(`/api/transactions/${tx.id}/comments`, "POST", { body: body.trim() })) setBody("");
  }
  return <article className="family-record">
    <header><span className="dot" style={{ background: member?.color }} /><strong>{member?.displayName ?? "가족"}</strong><time dateTime={tx.createdAt}>{new Date(tx.createdAt).toLocaleDateString("ko-KR")}</time></header>
    <Link className="family-record-main" to={`/records?m=${tx.occurredAt.slice(0, 7)}&tab=${tx.kind}&entry=${tx.id}`}><span><strong>{tx.counterparty}</strong><small>{tx.occurredAt.slice(0, 10)} {tx.kind === "expense" ? "지출" : "수입"}{tx.installmentMonths > 1 ? ` | ${tx.installmentMonths}개월 할부 총액` : ""}</small></span><b className="num">{formatWon(tx.amount)}원</b></Link>
    {tx.memo && <p>{tx.memo}</p>}
    <div className="family-actions">{([['like', '좋아요'], ['thanks', '고마워요']] as const).map(([reaction, label]) => <button type="button" className="btn btn-ghost btn-sm" key={reaction} disabled={change.isPending} aria-pressed={mine === reaction} onClick={() => void act(`/api/transactions/${tx.id}/reaction`, "PUT", { reaction: mine === reaction ? null : reaction })}><Heart size={15} aria-hidden="true" />{label} {reactions.filter((r) => r.reaction === reaction).length || ""}</button>)}<button className="btn btn-ghost btn-sm" type="button" aria-expanded={open} onClick={() => setOpen(!open)}><MessageCircle size={15} aria-hidden="true" />댓글 {comments.length}</button></div>
    {open && <div className="family-comments">{comments.map((c) => <div className="family-comment" key={c.id}><strong>{household.members.find((m) => m.id === c.memberId)?.displayName ?? "가족"}</strong><p>{c.body}</p>{(c.memberId === household.me.memberId || household.me.role === "owner") && <button type="button" className="icon-btn danger" title="댓글 삭제" aria-label="댓글 삭제" disabled={change.isPending} onClick={() => void act(`/api/comments/${c.id}`, "DELETE")}><Trash2 size={15} /></button>}</div>)}<form onSubmit={(e) => void comment(e)}><input className="input" aria-label={`${tx.counterparty} 기록에 댓글`} placeholder="한마디 남기기" value={body} maxLength={300} required onChange={(e) => setBody(e.target.value)} /><button className="btn btn-accent" disabled={change.isPending || !body.trim()}>등록</button></form></div>}
  </article>;
}
