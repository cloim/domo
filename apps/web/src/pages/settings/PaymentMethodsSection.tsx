import {
  CARD_ISSUERS,
  DEFAULT_CARD_BILLING,
  nextBillingCycle,
  nowLocalDateTime,
  paymentMethodInputSchema,
  paymentMethodLabel,
  type CardBill,
  type PaymentMethod,
  type PaymentMethodInput,
} from "@domo/core";
import { Banknote, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useDialog } from "../../components/Dialogs.tsx";
import SelectControl from "../../components/SelectControl/index.ts";
import { DndSortableList } from "../../components/SortableList.tsx";
import { api } from "../../lib/api.ts";
import { dayLabel, dayOptionLabel, formatShortDate, formatWon } from "../../lib/format.ts";
import { useHousehold, useHouseholdMutation, type HouseholdData } from "../../lib/queries.ts";
import { useCardBills } from "../../lib/useCardBills.ts";
import { MD_TWO_PANE, useMedia, useNumericInputMode } from "../../lib/useMedia.ts";

const NEW = "new";
const CUSTOM = "__custom";
const OFFSETS = [
  { value: -2, label: "전전월" },
  { value: -1, label: "전월" },
  { value: 0, label: "당월" },
];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function PaymentMethodsSection() {
  const { data, refetch } = useHousehold();
  // 복원된 캐시를 먼저 보여주더라도 설정은 서버의 최신 저장값으로 맞춘다.
  useEffect(() => { void refetch(); }, [refetch]);
  const dialog = useDialog();
  const reorder = useHouseholdMutation((ids: string[]) => api("/api/payment-methods/order", { method: "PUT", body: { ids } }));
  const { bills } = useCardBills();
  const [params, setParams] = useSearchParams();
  const twoPane = useMedia(MD_TWO_PANE);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const methods = data!.paymentMethods;
  const q = query.trim().toLowerCase();
  const visible = methods.filter((m) => !q || [m.name, m.issuer, m.last4].some((v) => v?.toLowerCase().includes(q)));
  const active = visible.filter((m) => !m.archived);
  const inactive = visible.filter((m) => m.archived);

  // 넓은 화면은 첫 항목을 바로 보여주고, 좁은 화면은 목록부터 보여준다.
  const requested = params.get("id");
  const selectedId = requested ?? (twoPane ? (methods.find((m) => !m.archived)?.id ?? null) : null);
  const selected = selectedId === NEW ? null : (methods.find((m) => m.id === selectedId) ?? null);
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("id", id);
    else next.delete("id");
    setParams(next, { replace: !twoPane && !id });
  };

  return (
    <div className={`md${selectedId ? " has-selection" : ""}`}>
      <section className="md-list" aria-label="지출수단 목록">
        <div className="md-list-head">
          <div className="md-search">
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder="별칭, 카드사, 끝번호" aria-label="지출수단 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="md-list-body">
          <DndSortableList items={active} disabled={!!q || reorder.isPending}
            onReorder={(ids) => reorder.mutate(ids, { onError: (err) => void dialog.alert("순서를 바꾸지 못했습니다", err.message) })}
            renderItem={(m) => <MethodItem method={m} bill={bills.get(m.id)} current={m.id === selectedId} onSelect={() => select(m.id)} />} />
          {inactive.length > 0 && <button type="button" className="md-group-toggle" aria-expanded={showInactive} onClick={() => setShowInactive((open) => !open)}>
            {showInactive ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}사용 안 함 <span>{inactive.length}</span>
          </button>}
          {showInactive && inactive.map((m) => (
            <MethodItem key={m.id} method={m} current={m.id === selectedId} onSelect={() => select(m.id)} />
          ))}
          {visible.length === 0 && <p className="hint" style={{ padding: "12px 10px" }}>검색 결과가 없어요.</p>}
        </div>
        <div className="md-list-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={() => select(NEW)}>
            <Plus size={17} aria-hidden="true" /> 카드 추가
          </button>
        </div>
      </section>

      <section className="md-detail" aria-label="지출수단 상세">
        {selectedId === NEW || selected ? (
          <MethodEditor key={selectedId} data={data!} method={selected} bill={selected ? bills.get(selected.id) : undefined} onBack={() => select(null)} onSaved={select} />
        ) : (
          <div className="md-empty">지출수단을 골라 주세요.</div>
        )}
      </section>
    </div>
  );
}

function MethodItem({ method: m, bill, current, onSelect }: { method: PaymentMethod; bill?: CardBill; current: boolean; onSelect: () => void }) {
  const sub = m.type === "cash" ? ["현금"] : [m.issuer, m.cardKind === "check" ? "체크" : m.cardKind === "credit" ? "신용" : null, m.last4].filter(Boolean);
  return (
    <button type="button" className={`md-item${m.archived ? " is-off" : ""}`} aria-current={current} onClick={onSelect}>
      <span className="md-item-icon">{m.type === "cash" ? <Banknote size={18} aria-hidden="true" /> : <CreditCard size={18} aria-hidden="true" />}</span>
      <span className="md-item-main">
        <strong>{m.name}</strong>
        <span className="md-item-sub">
          {sub.map((s, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span className="sep" aria-hidden="true" />}
              <span>{s}</span>
            </span>
          ))}
        </span>
      </span>
      {bill && (
        <span className="md-item-end num">
          {formatWon(bill.amount)}원
          <br />
          <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{formatShortDate(bill.paymentDate)} 결제</span>
        </span>
      )}
    </button>
  );
}

type Draft = Omit<PaymentMethodInput, "cycleStartOffset" | "cycleStartDay" | "cycleEndOffset" | "cycleEndDay" | "paymentDay"> & {
  billing: boolean;
  cycleStartOffset: number;
  cycleStartDay: number;
  cycleEndOffset: number;
  cycleEndDay: number;
  paymentDay: number;
};

function toDraft(m: PaymentMethod | null): Draft {
  if (!m) {
    return { type: "card", name: "", active: true, issuer: CARD_ISSUERS[0]!, cardKind: "credit", last4: null, holderMemberId: null, holderName: null, monthlyTargetAmount: null, targetExcludedCounterparties: [], billing: true, ...DEFAULT_CARD_BILLING };
  }
  return {
    type: m.type,
    name: m.name,
    active: !m.archived,
    issuer: m.issuer,
    cardKind: m.cardKind,
    last4: m.last4,
    holderMemberId: m.holderMemberId,
    holderName: m.holderName,
    monthlyTargetAmount: m.monthlyTargetAmount ?? null,
    targetExcludedCounterparties: m.targetExcludedCounterparties ?? [],
    billing: m.paymentDay !== null,
    cycleStartOffset: m.cycleStartOffset ?? DEFAULT_CARD_BILLING.cycleStartOffset,
    cycleStartDay: m.cycleStartDay ?? DEFAULT_CARD_BILLING.cycleStartDay,
    cycleEndOffset: m.cycleEndOffset ?? DEFAULT_CARD_BILLING.cycleEndOffset,
    cycleEndDay: m.cycleEndDay ?? DEFAULT_CARD_BILLING.cycleEndDay,
    paymentDay: m.paymentDay ?? DEFAULT_CARD_BILLING.paymentDay,
  };
}

function toInput({ billing, ...d }: Draft): PaymentMethodInput {
  return {
    ...d,
    name: d.name.trim(),
    last4: d.last4 || null,
    holderName: d.holderName?.trim() || null,
    cycleStartOffset: billing ? d.cycleStartOffset : null,
    cycleStartDay: billing ? d.cycleStartDay : null,
    cycleEndOffset: billing ? d.cycleEndOffset : null,
    cycleEndDay: billing ? d.cycleEndDay : null,
    paymentDay: billing ? d.paymentDay : null,
  };
}

interface EditorProps {
  data: HouseholdData;
  method: PaymentMethod | null;
  bill?: CardBill;
  onBack: () => void;
  onSaved: (id: string) => void;
}

function MethodEditor({ data, method, bill, onBack, onSaved }: EditorProps) {
  const dialog = useDialog();
  const [draft, setDraft] = useState<Draft>(() => toDraft(method));
  const [dirty, setDirty] = useState(false);
  const numericMode = useNumericInputMode();
  const [tab, setTab] = useState<"basic" | "target">("basic");
  const [excludedText, setExcludedText] = useState(() => (method?.targetExcludedCounterparties ?? []).join("\n"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customIssuer, setCustomIssuer] = useState(() => !!method?.issuer && !CARD_ISSUERS.includes(method.issuer));
  const [customHolder, setCustomHolder] = useState(() => !!method?.holderName);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  useEffect(() => {
    if (dirty) return;
    setDraft(toDraft(method));
    setExcludedText((method?.targetExcludedCounterparties ?? []).join("\n"));
    setCustomIssuer(!!method?.issuer && !CARD_ISSUERS.includes(method.issuer));
    setCustomHolder(!!method?.holderName);
    setErrors({});
  }, [method, dirty]);

  const save = useHouseholdMutation(async (input: PaymentMethodInput) =>
    method ? (await api(`/api/payment-methods/${method.id}`, { method: "PUT", body: input }), method.id) : (await api<{ id: string }>("/api/payment-methods", { method: "POST", body: input })).id,
  );
  const remove = useHouseholdMutation((id: string) => api<{ archived: boolean }>(`/api/payment-methods/${id}`, { method: "DELETE" }));
  const isCard = draft.type === "card";
  const autoName = paymentMethodLabel({ name: "", issuer: draft.issuer, last4: draft.last4 });
  const today = nowLocalDateTime().slice(0, 10);
  const preview = useMemo(() => (draft.billing ? nextBillingCycle(draft, today) : null), [draft, today]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = paymentMethodInputSchema.safeParse(toInput({ ...draft, targetExcludedCounterparties: [...new Set(excludedText.split("\n").map((name) => name.trim()).filter(Boolean))] }));
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      setTab(next.monthlyTargetAmount || next.targetExcludedCounterparties ? "target" : "basic");
      return;
    }
    setErrors({});
    try {
      const id = await save.mutateAsync(parsed.data);
      setDirty(false);
      await dialog.alert("저장했습니다", `${paymentMethodLabel(parsed.data)} 정보를 저장했어요.`);
      if (!method) onSaved(id);
    } catch (err) {
      await dialog.alert("저장하지 못했습니다", (err as Error).message);
    }
  }

  async function onDelete() {
    if (!method) return;
    const ok = await dialog.confirm({
      title: "지출수단 삭제",
      message: `${method.name}을(를) 삭제할까요?\n기록에 쓰인 지출수단은 지우지 않고 '사용 안 함'으로 바꿔 과거 내역을 지킵니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await remove.mutateAsync(method.id);
      if (r.archived) await dialog.alert("사용 안 함으로 바꿨습니다", `${method.name}은(는) 기록에 쓰여 삭제하지 않고 사용 안 함으로 바꿨어요.`);
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
        <h2>{method ? method.name : "새 카드"}</h2>
        {method && <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => void onDelete()} disabled={remove.isPending}><Trash2 size={16} aria-hidden="true" /> 삭제</button>}
        <button type="submit" className="btn btn-primary btn-sm" disabled={save.isPending}>{save.isPending ? "저장 중" : method ? "저장" : "추가"}</button>
      </div>

      {isCard && (
        <div className="segmented" role="tablist" aria-label="지출수단 설정" style={{ margin: "12px var(--gutter)", alignSelf: "flex-start" }} onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const next = e.key === "Home" ? "basic" : e.key === "End" ? "target" : tab === "basic" ? "target" : "basic";
          setTab(next);
          e.currentTarget.querySelector<HTMLButtonElement>(`#pm-${next}-tab`)?.focus();
        }}>
          <button id="pm-basic-tab" type="button" role="tab" aria-selected={tab === "basic"} tabIndex={tab === "basic" ? 0 : -1} aria-controls="pm-basic-panel" onClick={() => setTab("basic")}>기본 정보</button>
          <button id="pm-target-tab" type="button" role="tab" aria-selected={tab === "target"} tabIndex={tab === "target" ? 0 : -1} aria-controls="pm-target-panel" onClick={() => setTab("target")}>월 목표</button>
        </div>
      )}
      <div className="md-detail-body md-detail-body-fill">
        {isCard && tab === "target" && (
          <div id="pm-target-panel" style={{ display: "flex", flexDirection: "column", gap: "var(--field-gap)" }} role="tabpanel" aria-labelledby="pm-target-tab">
            <div className="field">
              <label className="field-label" htmlFor="pm-target">월 목표 금액 (원)</label>
              <input id="pm-target" className="input num" inputMode={numericMode} placeholder="미설정" value={draft.monthlyTargetAmount == null ? "" : formatWon(draft.monthlyTargetAmount)} aria-invalid={!!errors.monthlyTargetAmount} aria-describedby="pm-target-hint pm-target-error" onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, "");
                set("monthlyTargetAmount", value ? Number(value) : null);
              }} />
              <span id="pm-target-error" className="field-error">{errors.monthlyTargetAmount}</span>
              <p id="pm-target-hint" className="hint">매월 1일부터 말일까지 사용액을 집계해요. 할부는 승인월에 전체 금액을 합산합니다. 이번 지출을 포함해 목표 이상이면 지출 등록 알림에 안내해요. 금액을 비우면 목표 설정을 해제합니다.</p>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="pm-target-excluded">집계 제외 지출처</label>
              <textarea id="pm-target-excluded" className="input" rows={5} value={excludedText} placeholder="지출처 이름을 한 줄에 하나씩 입력" aria-invalid={!!errors.targetExcludedCounterparties} aria-describedby="pm-target-excluded-hint pm-target-excluded-error" onChange={(e) => { setDirty(true); setExcludedText(e.target.value); }} />
              <span id="pm-target-excluded-error" className="field-error">{errors.targetExcludedCounterparties}</span>
              <p id="pm-target-excluded-hint" className="hint">거래처 이름이 정확히 일치하는 지출을 월 목표 집계에서 제외합니다. 지출 기록과 일반 통계는 유지돼요.</p>
            </div>
          </div>
        )}
        <div id="pm-basic-panel" role="tabpanel" aria-labelledby={isCard ? "pm-basic-tab" : undefined} hidden={isCard && tab !== "basic"} style={isCard && tab !== "basic" ? undefined : { display: "contents" }}>
        {bill && (
          <div className="bill">
            <span className="bill-meta">다음 결제 {formatShortDate(bill.paymentDate)}</span>
            <span className="bill-amount num">
              {formatWon(bill.amount)}
              <small>원</small>
            </span>
            <span className="bill-meta">
              {formatShortDate(bill.usage.start)} ~ {formatShortDate(bill.usage.end)} 사용분 {bill.count}건{bill.inProgress ? ", 집계 중" : ""}
            </span>
          </div>
        )}

        {isCard && (
          <>
            <div className="form-row">
              <div className="field">
                <label className="field-label" htmlFor="pm-issuer">
                  카드사
                </label>
                <SelectControl
                  id="pm-issuer"
                  value={customIssuer ? CUSTOM : (draft.issuer ?? "")}
                  onChange={(e) => {
                    const custom = e.target.value === CUSTOM;
                    setCustomIssuer(custom);
                    set("issuer", custom ? "" : e.target.value);
                  }}
                >
                  {CARD_ISSUERS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value={CUSTOM}>직접 입력</option>
                </SelectControl>
              </div>
              <div className="field">
                <span className="field-label">종류</span>
                <div className="segmented" role="group" aria-label="카드 종류" style={{ alignSelf: "flex-start" }}>
                  {(["credit", "check"] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={draft.cardKind === k} onClick={() => set("cardKind", k)}>
                      {k === "credit" ? "신용" : "체크"}
                    </button>
                  ))}
                </div>
                {errors.cardKind && <span className="field-error">{errors.cardKind}</span>}
              </div>
            </div>
            {customIssuer && (
              <input className="input" aria-label="카드사 이름" placeholder="카드사 이름" maxLength={30} value={draft.issuer ?? ""} onChange={(e) => set("issuer", e.target.value)} autoFocus />
            )}
            {errors.issuer && <span className="field-error">{errors.issuer}</span>}

            <div className="form-row">
              <div className="field">
                <label className="field-label" htmlFor="pm-last4">
                  <span>
                    끝번호 <span className="field-optional">(선택)</span>
                  </span>
                </label>
                <input
                  id="pm-last4"
                  className="input num"
                  inputMode={numericMode}
                  maxLength={4}
                  placeholder="1234"
                  aria-invalid={!!errors.last4}
                  value={draft.last4 ?? ""}
                  onChange={(e) => set("last4", e.target.value.replace(/\D/g, ""))}
                />
                {errors.last4 && <span className="field-error">{errors.last4}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="pm-name">
                  별칭
                </label>
                <input id="pm-name" className="input" maxLength={40} placeholder={autoName} value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {!isCard && (
          <div className="field">
            <label className="field-label" htmlFor="pm-name">
              별칭
            </label>
            <input id="pm-name" className="input" maxLength={40} aria-invalid={!!errors.name} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
        )}

        {isCard && (
          <>
            <div className="field">
              <div className="field-label">
                <span>집계 기간과 결제일</span>
                <label className="switch">
                  <input type="checkbox" checked={draft.billing} onChange={(e) => set("billing", e.target.checked)} />
                  <span className="switch-track" aria-hidden="true" />
                  <span className="sr-only">집계 기간과 결제일 사용</span>
                </label>
              </div>
              {draft.billing && (
                <>
                  <div className="cycle-row">
                    <span className="cycle-label">시작</span>
                    <SelectControl aria-label="집계 시작 월" value={draft.cycleStartOffset} onChange={(e) => set("cycleStartOffset", Number(e.target.value))}>
                      {OFFSETS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </SelectControl>
                    <SelectControl aria-label="집계 시작일" value={draft.cycleStartDay} onChange={(e) => set("cycleStartDay", Number(e.target.value))}>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {dayOptionLabel(d)}
                        </option>
                      ))}
                    </SelectControl>
                  </div>
                  <div className="cycle-row">
                    <span className="cycle-label">종료</span>
                    <SelectControl aria-label="집계 종료 월" value={draft.cycleEndOffset} onChange={(e) => set("cycleEndOffset", Number(e.target.value))}>
                      {OFFSETS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </SelectControl>
                    <SelectControl aria-label="집계 종료일" value={draft.cycleEndDay} onChange={(e) => set("cycleEndDay", Number(e.target.value))}>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {dayOptionLabel(d)}
                        </option>
                      ))}
                    </SelectControl>
                  </div>
                  <div className="cycle-row">
                    <span className="cycle-label">결제일</span>
                    <span className="cycle-label" style={{ width: "auto" }}>
                      매월
                    </span>
                    <SelectControl aria-label="결제일" value={draft.paymentDay} onChange={(e) => set("paymentDay", Number(e.target.value))}>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {dayOptionLabel(d)}
                        </option>
                      ))}
                    </SelectControl>
                  </div>
                  {preview && !errors.cycleEndDay && (
                    <span className="hint">
                      예: {formatShortDate(preview.paymentDate)} 결제분은 {formatShortDate(preview.usage.start)} ~ {formatShortDate(preview.usage.end)} 사용분입니다.
                    </span>
                  )}
                  {(errors.cycleEndDay || errors.paymentDay) && <span className="field-error">{errors.cycleEndDay ?? errors.paymentDay}</span>}
                </>
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="pm-holder">
                <span>
                  명의자 <span className="field-optional">(선택)</span>
                </span>
              </label>
              <SelectControl
                id="pm-holder"
                value={customHolder ? CUSTOM : (draft.holderMemberId ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomHolder(v === CUSTOM);
                  setDirty(true);
                  setDraft((d) => ({ ...d, holderMemberId: v && v !== CUSTOM ? v : null, holderName: v === CUSTOM ? (d.holderName ?? "") : null }));
                }}
              >
                <option value="">지정 안 함</option>
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
                <option value={CUSTOM}>직접 입력</option>
              </SelectControl>
              {customHolder && (
                <input className="input" aria-label="명의자 이름" placeholder="예: 첫째" maxLength={30} value={draft.holderName ?? ""} onChange={(e) => set("holderName", e.target.value)} />
              )}
            </div>
          </>
        )}

        <div className="field">
          <div className="field-label">
            <span>사용 여부</span>
            <label className="switch">
              <span>{draft.active ? "사용 중" : "사용 안 함"}</span>
              <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>
          {!draft.active && <span className="hint">기록 입력 목록에서 빠지고, 과거 기록에는 그대로 남아요.</span>}
        </div>
        </div>
      </div>

    </form>
  );
}
