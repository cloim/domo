import {
  buildRecurringTimeline,
  currentYearMonth,
  nextRecurringDate,
  recurringInputSchema,
  type RecurringAmountChange,
  type RecurringExpense,
  type RecurringInput,
  type RecurringMonthRecord,
} from "@domo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Repeat, Search, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useDialog } from "../../components/Dialogs.tsx";
import SelectControl from "../../components/SelectControl/index.ts";
import { api } from "../../lib/api.ts";
import { dayLabel, dayOptionLabel, formatShortDate, formatWon, formatYearMonth } from "../../lib/format.ts";
import { keys, useHousehold, type HouseholdData } from "../../lib/queries.ts";
import { MD_TWO_PANE, useMedia, useNumericInputMode } from "../../lib/useMedia.ts";

const NEW = "new";
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function FixedExpensesSection() {
  const { data } = useHousehold();
  const items = useQuery({ queryKey: keys.recurring, queryFn: () => api<RecurringExpense[]>("/api/recurring") });
  const [params, setParams] = useSearchParams();
  const twoPane = useMedia(MD_TWO_PANE);
  const [query, setQuery] = useState("");

  const all = items.data ?? [];
  const thisMonth = currentYearMonth();
  const ended = (r: RecurringExpense) => !!r.endMonth && r.endMonth < thisMonth;
  const q = query.trim().toLowerCase();
  const visible = all.filter((r) => !q || [r.counterparty, r.memo].some((v) => v?.toLowerCase().includes(q)));
  const running = visible.filter((r) => r.active && !ended(r));
  const stopped = visible.filter((r) => !r.active || ended(r));
  const monthlyTotal = all.filter((r) => r.active && !ended(r)).reduce((s, r) => s + r.amount, 0);

  const requested = params.get("id");
  const selectedId = requested ?? (twoPane ? (running[0]?.id ?? null) : null);
  const selected = selectedId === NEW ? null : (all.find((r) => r.id === selectedId) ?? null);
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("id", id);
    else next.delete("id");
    setParams(next, { replace: !twoPane && !id });
  };

  return (
    <div className={`md${selectedId ? " has-selection" : ""}`}>
      <section className="md-list" aria-label="고정지출 목록">
        <div className="md-list-head">
          <div className="kv">
            <span className="hint">매월 합계</span>
            <strong className="num">{formatWon(monthlyTotal)}원</strong>
          </div>
          <div className="md-search">
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder="지출처, 지출내용" aria-label="고정지출 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="md-list-body">
          {items.isPending ? (
            <span className="skeleton" style={{ display: "block", height: 112, margin: "0 8px" }} />
          ) : items.isError ? (
            <div className="empty" role="alert" style={{ padding: 24 }}>
              <strong>고정지출을 불러오지 못했어요</strong>
              <button type="button" className="btn btn-ghost" onClick={() => void items.refetch()}>
                다시 시도
              </button>
            </div>
          ) : all.length === 0 ? (
            <p className="hint" style={{ padding: "12px 10px" }}>
              관리비, 통신비, 보험료처럼 매월 같은 날 나가는 지출을 등록하면 결제일에 기록이 자동으로 생겨요.
            </p>
          ) : (
            <>
              {running.map((r) => (
                <FixedItem key={r.id} item={r} data={data!} current={r.id === selectedId} onSelect={() => select(r.id)} />
              ))}
              {stopped.length > 0 && <div className="md-group">멈춤, 종료</div>}
              {stopped.map((r) => (
                <FixedItem key={r.id} item={r} data={data!} current={r.id === selectedId} off onSelect={() => select(r.id)} />
              ))}
              {visible.length === 0 && <p className="hint" style={{ padding: "12px 10px" }}>검색 결과가 없어요.</p>}
            </>
          )}
        </div>
        <div className="md-list-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={() => select(NEW)}>
            <Plus size={17} aria-hidden="true" /> 고정지출 추가
          </button>
        </div>
      </section>

      <section className="md-detail" aria-label="고정지출 상세">
        {selectedId === NEW || selected ? (
          <FixedEditor key={selectedId} data={data!} item={selected} onBack={() => select(null)} onSaved={select} />
        ) : (
          <div className="md-empty">고정지출을 골라 주세요.</div>
        )}
      </section>
    </div>
  );
}

/** 목록과 상세 제목. 지출내용이 있으면 지출내용, 없으면 지출처 */
const fixedTitle = (item: Pick<RecurringExpense, "memo" | "counterparty">) => item.memo || item.counterparty;

function FixedItem({ item, data, current, off, onSelect }: { item: RecurringExpense; data: HouseholdData; current: boolean; off?: boolean; onSelect: () => void }) {
  const method = data.paymentMethods.find((m) => m.id === item.paymentMethodId);
  const next = nextRecurringDate(item);
  const sub = [item.memo ? item.counterparty : null, `매월 ${dayLabel(item.paymentDay)}`, method?.name].filter(Boolean);
  return (
    <button type="button" className={`md-item${off ? " is-off" : ""}`} aria-current={current} onClick={onSelect}>
      <span className="md-item-icon">
        <Repeat size={17} aria-hidden="true" />
      </span>
      <span className="md-item-main">
        <strong>{fixedTitle(item)}</strong>
        <span className="md-item-sub">
          {sub.map((text, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span className="sep" aria-hidden="true" />}
              <span>{text}</span>
            </span>
          ))}
        </span>
      </span>
      <span className="md-item-end num">
        {formatWon(item.amount)}원
        {next && !off && (
          <>
            <br />
            <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{formatShortDate(next)} 예정</span>
          </>
        )}
      </span>
    </button>
  );
}

interface Draft {
  counterparty: string;
  memo: string;
  amount: string;
  paymentDay: number;
  memberId: string;
  paymentMethodId: string;
  parentId: string;
  categoryId: string;
  endMonth: string;
  active: boolean;
}

function toDraft(item: RecurringExpense | null, data: HouseholdData): Draft {
  const parentOf = (id: string) => data.categories.find((c) => c.id === id)?.parentId ?? "";
  return {
    counterparty: item?.counterparty ?? "",
    memo: item?.memo ?? "",
    amount: item ? String(item.amount) : "",
    paymentDay: item?.paymentDay ?? 25,
    memberId: item?.memberId ?? data.me.memberId,
    paymentMethodId: item?.paymentMethodId ?? data.paymentMethods.find((m) => !m.archived)?.id ?? "",
    parentId: item ? parentOf(item.categoryId) : "",
    categoryId: item?.categoryId ?? "",
    endMonth: item?.endMonth ?? "",
    active: item?.active ?? true,
  };
}

function FixedEditor({ data, item, onBack, onSaved }: { data: HouseholdData; item: RecurringExpense | null; onBack: () => void; onSaved: (id: string) => void }) {
  const dialog = useDialog();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(item, data));
  const numericMode = useNumericInputMode();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    setDraft(toDraft(item, data));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // 저장하면 결제일이 된 기록이 바로 생길 수 있어 기록 목록도 다시 받는다.
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: keys.recurring }), qc.invalidateQueries({ queryKey: ["transactions"] }), qc.invalidateQueries({ queryKey: ["recurring-history"] })]);
  const save = useMutation({
    mutationFn: async (input: RecurringInput) =>
      item ? (await api(`/api/recurring/${item.id}`, { method: "PUT", body: input }), item.id) : (await api<{ id: string }>("/api/recurring", { method: "POST", body: input })).id,
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/recurring/${id}`, { method: "DELETE" }), onSuccess: refresh });

  const visible = (c: { archived: boolean; id: string }) => !c.archived || c.id === draft.categoryId || c.id === draft.parentId;
  const parents = data.categories.filter((c) => c.kind === "expense" && !c.parentId && visible(c));
  const children = data.categories.filter((c) => c.parentId === draft.parentId && visible(c));
  const methods = data.paymentMethods.filter((m) => !m.archived || m.id === draft.paymentMethodId);
  const amountNumber = Number(draft.amount) || 0;
  const next = item ? nextRecurringDate(item) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = recurringInputSchema.safeParse({
      counterparty: draft.counterparty,
      memo: draft.memo.trim() || null,
      amount: amountNumber,
      paymentDay: draft.paymentDay,
      memberId: draft.memberId,
      paymentMethodId: draft.paymentMethodId,
      categoryId: draft.categoryId,
      endMonth: draft.endMonth || null,
      active: draft.active,
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        nextErrors[key] ??= key === "amount" ? "금액을 입력해 주세요." : key === "categoryId" ? "소분류를 선택해 주세요." : issue.message;
      }
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    try {
      const id = await save.mutateAsync(parsed.data);
      await dialog.alert("저장했습니다", `${fixedTitle(parsed.data)} 고정지출을 저장했어요. 결제일이 되면 지출 기록이 자동으로 생깁니다.`);
      if (!item) onSaved(id);
    } catch (err) {
      await dialog.alert("저장하지 못했습니다", (err as Error).message);
    }
  }

  async function onDelete() {
    if (!item) return;
    const ok = await dialog.confirm({
      title: "고정지출 삭제",
      message: `${fixedTitle(item)} 고정지출을 삭제할까요?\n이미 만들어진 지출 기록은 그대로 남습니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(item.id);
      onBack();
    } catch (err) {
      await dialog.alert("삭제하지 못했습니다", (err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <div className="md-detail-head">
        <button type="button" className="icon-btn md-back" aria-label="목록으로" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2>{item ? fixedTitle(item) : "새 고정지출"}</h2>
        {item && <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => void onDelete()} disabled={remove.isPending}><Trash2 size={16} aria-hidden="true" /> 삭제</button>}
        <button type="submit" className="btn btn-primary btn-sm" disabled={save.isPending}>{save.isPending ? "저장 중" : item ? "저장" : "추가"}</button>
      </div>

      <div className="md-detail-body md-detail-body-fill">
        {item && (
          <p className="hint" style={{ margin: 0 }}>
            {next ? `다음 기록은 ${formatShortDate(next)}에 만들어져요.` : item.active ? "종료월이 지나 더 만들지 않아요." : "멈춘 상태라 기록을 만들지 않아요."}
            {item.lastGeneratedMonth && ` 마지막 생성: ${formatYearMonth(item.lastGeneratedMonth)}`}
          </p>
        )}

        <div className="field">
          <label className="field-label" htmlFor="fx-amount">
            금액
          </label>
          <div className="amount-field">
            <input
              id="fx-amount"
              className="amount-input num"
              inputMode={numericMode}
              autoComplete="off"
              placeholder="0"
              aria-invalid={!!errors.amount}
              value={amountNumber ? formatWon(amountNumber) : ""}
              onChange={(e) => set("amount", e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
            />
            <span className="amount-unit">원</span>
          </div>
          {errors.amount && <span className="field-error">{errors.amount}</span>}
        </div>

        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="fx-day">
              결제일 (매월)
            </label>
            <SelectControl id="fx-day" value={draft.paymentDay} onChange={(e) => set("paymentDay", Number(e.target.value))}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {dayOptionLabel(d)}
                </option>
              ))}
            </SelectControl>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="fx-member">
              지출자
            </label>
            <SelectControl id="fx-member" value={draft.memberId} onChange={(e) => set("memberId", e.target.value)}>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </SelectControl>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="fx-counterparty">
            지출처
          </label>
          <input
            id="fx-counterparty"
            className="input"
            maxLength={60}
            placeholder="예: 아파트 관리사무소"
            aria-invalid={!!errors.counterparty}
            value={draft.counterparty}
            onChange={(e) => set("counterparty", e.target.value)}
          />
          {errors.counterparty && <span className="field-error">{errors.counterparty}</span>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="fx-memo">
            <span>
              지출내용 <span className="field-optional">(선택)</span>
            </span>
          </label>
          <input id="fx-memo" className="input" maxLength={200} placeholder="예: 관리비" value={draft.memo} onChange={(e) => set("memo", e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="fx-method">
            지출수단
          </label>
          <SelectControl id="fx-method" className={draft.paymentMethodId ? "" : "is-placeholder"} value={draft.paymentMethodId} aria-invalid={!!errors.paymentMethodId} onChange={(e) => set("paymentMethodId", e.target.value)}>
            <option value="" disabled>
              선택
            </option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectControl>
          {errors.paymentMethodId && <span className="field-error">{errors.paymentMethodId}</span>}
        </div>

        <div className="field">
          <span className="field-label">분류</span>
          <div className="form-row">
            <SelectControl
              aria-label="대분류"
              className={draft.parentId ? "" : "is-placeholder"}
              value={draft.parentId}
              onChange={(e) => {
                const kids = data.categories.filter((c) => c.parentId === e.target.value && !c.archived);
                setDraft((d) => ({ ...d, parentId: e.target.value, categoryId: kids.length === 1 ? kids[0]!.id : "" }));
              }}
            >
              <option value="" disabled>
                대분류
              </option>
              {parents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectControl>
            <SelectControl
              aria-label="소분류"
              className={draft.categoryId ? "" : "is-placeholder"}
              value={draft.categoryId}
              aria-invalid={!!errors.categoryId}
              disabled={!draft.parentId}
              onChange={(e) => set("categoryId", e.target.value)}
            >
              <option value="" disabled>
                소분류
              </option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectControl>
          </div>
          {errors.categoryId && <span className="field-error">{errors.categoryId}</span>}
        </div>

        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="fx-end">
              <span>
                종료월 <span className="field-optional">(선택)</span>
              </span>
            </label>
            <input id="fx-end" className="input" type="month" value={draft.endMonth} onChange={(e) => set("endMonth", e.target.value)} />
            <span className="hint">{draft.endMonth ? `${formatYearMonth(draft.endMonth)}까지 만들어요.` : "비우면 계속 만들어요."}</span>
          </div>
          <div className="field">
            <span className="field-label">사용 여부</span>
            <label className="switch" style={{ height: "var(--control-h)" }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              <span>{draft.active ? "사용 중" : "멈춤"}</span>
            </label>
          </div>
        </div>
        {item && <AmountHistory item={item} data={data} />}
        {item && !item.active && draft.active && <span className="hint">다시 켜면 멈춰 있던 달은 건너뛰고 다음 결제일부터 만들어요.</span>}
        {!item && <span className="hint">이번 달 결제일이 이미 지났다면 다음 달부터 만들어요.</span>}
      </div>

    </form>
  );
}

/** 월별 실제 금액과 설정 금액 변경을 최신순으로 보여준다. */
function AmountHistory({ item, data }: { item: RecurringExpense; data: HouseholdData }) {
  const history = useQuery({
    queryKey: ["recurring-history", item.id],
    queryFn: () => api<{ records: RecurringMonthRecord[]; changes: RecurringAmountChange[] }>(`/api/recurring/${item.id}/history`),
  });
  const memberName = (id: string | null) => data.members.find((m) => m.id === id)?.displayName ?? "알 수 없음";

  return (
    <section className="field" aria-labelledby="fx-history" style={{ marginTop: 8 }}>
      <h3 id="fx-history" className="field-label" style={{ margin: 0 }}>
        금액 이력
      </h3>
      {history.isPending ? (
        <span className="skeleton" style={{ display: "block", height: 96 }} />
      ) : history.isError ? (
        <div className="readonly-note" role="alert">
          이력을 불러오지 못했어요.
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => void history.refetch()}>
            다시 시도
          </button>
        </div>
      ) : (
        <ol className="timeline">
          {buildRecurringTimeline(history.data.records, history.data.changes, item.amount).map((t) =>
            t.type === "month" ? (
              <li key={t.transactionId}>
                <Link className="timeline-month" to={`/records?m=${t.month}`}>
                  <span className="timeline-date num">{t.month.replace("-", ".")}</span>
                  <strong className="num">{formatWon(t.amount)}원</strong>
                  {t.diff !== null && t.diff !== 0 && (
                    <span className={`timeline-diff num ${t.diff > 0 ? "up" : "down"}`}>
                      {t.diff > 0 ? "▲" : "▼"} {formatWon(Math.abs(t.diff))}
                    </span>
                  )}
                  {t.editedOnlyThisMonth && <span className="badge">이 달만 수정</span>}
                  <ChevronRight size={15} aria-hidden="true" className="timeline-go" />
                </Link>
              </li>
            ) : (
              <li key={t.id} className="timeline-change">
                <span className="timeline-date num">{formatShortDate(t.date)}</span>
                <span>
                  {t.oldAmount === null ? (
                    <>
                      <span className="num">{formatWon(t.newAmount)}원</span>으로 등록
                    </>
                  ) : (
                    <>
                      설정 변경 <span className="num">{formatWon(t.oldAmount)}</span> → <strong className="num">{formatWon(t.newAmount)}</strong>원
                    </>
                  )}
                  <span className="hint">, {memberName(t.memberId)}</span>
                </span>
              </li>
            ),
          )}
          {history.data.records.length === 0 && history.data.changes.length === 0 && <li className="hint">아직 이력이 없어요.</li>}
        </ol>
      )}
    </section>
  );
}
