import {
  allowsInstallment,
  MAX_INSTALLMENT_MONTHS,
  nowLocalDateTime,
  splitInstallment,
  transactionInputSchema,
  type Transaction,
  type TransactionInput,
  type TransactionKind,
} from "@domo/core";
import { Lock, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useDialog } from "../../components/Dialogs.tsx";
import SelectControl from "../../components/SelectControl/index.ts";
import { formatWon } from "../../lib/format.ts";
import { useDeleteTransaction, useSaveTransaction, type HouseholdData } from "../../lib/queries.ts";

const LAST_METHOD_KEY = "domo.lastPaymentMethod";
const KIND_LABEL = { expense: "지출", income: "수입" } as const;

export interface Suggestion {
  counterparty: string;
  categoryId: string;
  paymentMethodId: string | null;
}

interface Props {
  data: HouseholdData;
  kind: TransactionKind;
  transaction: Transaction | null;
  canEdit: boolean;
  suggestions: Suggestion[];
  onDone: (saved: Transaction | null) => void;
}

function readLastMethod() {
  try {
    return localStorage.getItem(LAST_METHOD_KEY);
  } catch {
    return null;
  }
}

export function EntryForm({ data, kind: initialKind, transaction, canEdit, suggestions, onDone }: Props) {
  const dialog = useDialog();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const listId = useId();

  const activeMethods = data.paymentMethods.filter((m) => !m.archived || m.id === transaction?.paymentMethodId);
  const defaultMethod = () => activeMethods.find((m) => m.id === readLastMethod())?.id ?? activeMethods[0]?.id ?? null;
  const parentOf = (categoryId: string | null) => data.categories.find((c) => c.id === categoryId)?.parentId ?? null;

  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? initialKind);
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(transaction ? transaction.paymentMethodId : defaultMethod());
  const [installmentMonths, setInstallmentMonths] = useState(transaction?.installmentMonths ?? 1);
  const [counterparty, setCounterparty] = useState(transaction?.counterparty ?? "");
  const [memo, setMemo] = useState(transaction?.memo ?? "");
  const [parentId, setParentId] = useState<string | null>(parentOf(transaction?.categoryId ?? null));
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.categoryId ?? null);
  const [occurredAt, setOccurredAt] = useState(transaction?.occurredAt ?? nowLocalDateTime());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 다른 기록을 고르거나 새 기록으로 바뀌면 폼을 그 기록으로 다시 채운다.
  useEffect(() => {
    setKind(transaction?.kind ?? initialKind);
    setAmount(transaction ? String(transaction.amount) : "");
    setPaymentMethodId(transaction ? transaction.paymentMethodId : defaultMethod());
    setInstallmentMonths(transaction?.installmentMonths ?? 1);
    setCounterparty(transaction?.counterparty ?? "");
    setMemo(transaction?.memo ?? "");
    setParentId(parentOf(transaction?.categoryId ?? null));
    setCategoryId(transaction?.categoryId ?? null);
    setOccurredAt(transaction?.occurredAt ?? nowLocalDateTime());
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction?.id, initialKind]);

  const visible = (c: { archived: boolean; id: string }) => !c.archived || c.id === categoryId || c.id === parentId;
  const parents = data.categories.filter((c) => c.kind === kind && !c.parentId && visible(c));
  const children = data.categories.filter((c) => c.parentId === parentId && visible(c));
  const method = activeMethods.find((m) => m.id === paymentMethodId);
  // 신용카드만 할부를 받는다. 체크카드와 현금은 일시불로 고정한다.
  const isCard = kind === "expense" && allowsInstallment(method);
  const amountNumber = Number(amount) || 0;
  const label = KIND_LABEL[kind];

  const split = useMemo(
    () => (isCard && installmentMonths > 1 && amountNumber > 0 ? splitInstallment(amountNumber, installmentMonths) : null),
    [isCard, installmentMonths, amountNumber],
  );
  const kindSuggestions = suggestions.filter((s) => (kind === "expense" ? s.paymentMethodId : !s.paymentMethodId));

  function switchKind(next: TransactionKind) {
    setKind(next);
    setParentId(null);
    setCategoryId(null);
    setPaymentMethodId(next === "expense" ? defaultMethod() : null);
    setInstallmentMonths(1);
  }

  function pickParent(id: string) {
    setParentId(id);
    const kids = data.categories.filter((c) => c.parentId === id && !c.archived);
    // 소분류가 하나뿐이면 바로 고른다.
    setCategoryId(kids.length === 1 ? kids[0]!.id : null);
  }

  function onCounterparty(value: string) {
    setCounterparty(value);
    const hit = kindSuggestions.find((s) => s.counterparty === value);
    if (hit && !categoryId) {
      setParentId(parentOf(hit.categoryId));
      setCategoryId(hit.categoryId);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input: TransactionInput = {
      kind,
      paymentMethodId: kind === "expense" ? paymentMethodId : null,
      counterparty,
      memo: memo.trim() || null,
      amount: amountNumber,
      installmentMonths: isCard ? installmentMonths : 1,
      categoryId: categoryId ?? "",
      occurredAt,
    };
    const parsed = transactionInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        next[key] ??= key === "categoryId" ? "소분류를 선택해 주세요." : key === "amount" ? "금액을 입력해 주세요." : issue.message;
      }
      setErrors(next);
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: transaction?.id, input: parsed.data });
      if (parsed.data.paymentMethodId) localStorage.setItem(LAST_METHOD_KEY, parsed.data.paymentMethodId);
      onDone(saved);
    } catch (err) {
      await dialog.alert("저장하지 못했습니다", (err as Error).message);
    }
  }

  async function onDelete() {
    if (!transaction) return;
    const ok = await dialog.confirm({
      title: "기록 삭제",
      message: transaction.installmentMonths > 1 ? `${transaction.installmentMonths}개월 할부 전체 회차가 함께 삭제됩니다.` : `${transaction.counterparty} 기록을 삭제할까요?`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(transaction.id);
      onDone(null);
    } catch (err) {
      await dialog.alert("삭제하지 못했습니다", (err as Error).message);
    }
  }

  const author = transaction && data.members.find((m) => m.id === transaction.memberId);

  return (
    <form className="entry-form" onSubmit={submit} noValidate>
      <div className="entry-form-body">
        {/* fieldset은 flex 스크롤 컨테이너로 쓰면 높이 제한이 풀려 비활성화 용도로만 쓴다. */}
        <fieldset disabled={!canEdit} className="entry-form-fields">
          {!canEdit && (
            <div className="readonly-note">
              <Lock size={15} aria-hidden="true" /> {author?.displayName ?? "다른 구성원"}님이 작성한 기록이라 볼 수만 있어요.
            </div>
          )}
          {!transaction && (
            <div className="segmented" role="group" aria-label="기록 종류" style={{ alignSelf: "flex-start" }}>
              {(["expense", "income"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => switchKind(k)}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="amount">
              금액
            </label>
            <div className="amount-field">
              <input
                id="amount"
                className="amount-input num"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-invalid={!!errors.amount}
                value={amountNumber ? formatWon(amountNumber) : ""}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
              />
              <span className="amount-unit">원</span>
            </div>
            {split && (
              <span className="amount-split num">
                월 {formatWon(split[1]!)}원 × {installmentMonths}회{split[0] !== split[1] ? ` (첫 회 ${formatWon(split[0]!)}원)` : ""}
              </span>
            )}
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>

          {kind === "expense" && (
            <div className="form-row">
              <div className="field">
                <label className="field-label" htmlFor="paymentMethod">
                  지출수단
                </label>
                <SelectControl
                  id="paymentMethod"
                  className={paymentMethodId ? "" : "is-placeholder"}
                  value={paymentMethodId ?? ""}
                  aria-invalid={!!errors.paymentMethodId}
                  onChange={(e) => {
                    setPaymentMethodId(e.target.value);
                    if (!allowsInstallment(activeMethods.find((m) => m.id === e.target.value))) setInstallmentMonths(1);
                  }}
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {activeMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </SelectControl>
                {errors.paymentMethodId && <span className="field-error">{errors.paymentMethodId}</span>}
              </div>
              {/* 할부가 안 되는 수단이어도 자리를 지켜 수단을 바꿀 때 폼이 흔들리지 않게 한다. */}
              <div className="field">
                <label className="field-label" htmlFor="installment">
                  할부
                </label>
                <SelectControl id="installment" value={isCard ? installmentMonths : 1} disabled={!isCard} onChange={(e) => setInstallmentMonths(Number(e.target.value))}>
                  <option value={1}>일시불</option>
                  {Array.from({ length: MAX_INSTALLMENT_MONTHS - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n}개월
                    </option>
                  ))}
                </SelectControl>
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="counterparty">
              {label}처
            </label>
            <input
              id="counterparty"
              className="input"
              list={listId}
              autoComplete="off"
              maxLength={60}
              placeholder={kind === "expense" ? "예: 동네마트" : "예: 회사"}
              aria-invalid={!!errors.counterparty}
              value={counterparty}
              onChange={(e) => onCounterparty(e.target.value)}
            />
            <datalist id={listId}>
              {kindSuggestions.map((s) => (
                <option key={s.counterparty} value={s.counterparty} />
              ))}
            </datalist>
            {errors.counterparty && <span className="field-error">{errors.counterparty}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="memo">
              <span>
                {label}내용 <span className="field-optional">(선택)</span>
              </span>
            </label>
            <input id="memo" className="input" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          <div className="field">
            <span className="field-label">분류</span>
            <div className="form-row">
              <SelectControl aria-label="대분류" className={parentId ? "" : "is-placeholder"} value={parentId ?? ""} aria-invalid={!!errors.categoryId && !parentId} onChange={(e) => pickParent(e.target.value)}>
                <option value="" disabled>
                  대분류
                </option>
                {parents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectControl>
              <SelectControl aria-label="소분류" className={categoryId ? "" : "is-placeholder"} value={categoryId ?? ""} aria-invalid={!!errors.categoryId && !!parentId} disabled={!parentId} onChange={(e) => setCategoryId(e.target.value)}>
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

          <div className="field">
            <label className="field-label" htmlFor="occurredAt">
              일시
            </label>
            <input id="occurredAt" className="input" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value.slice(0, 16))} />
            {errors.occurredAt && <span className="field-error">{errors.occurredAt}</span>}
          </div>
        </fieldset>
      </div>

      {canEdit && (
        <div className="entry-form-foot">
          {transaction && (
            <button type="button" className="btn btn-text-danger" onClick={onDelete} disabled={remove.isPending}>
              <Trash2 size={17} aria-hidden="true" /> 삭제
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "저장 중" : transaction ? "수정 저장" : `${label} 기록`}
          </button>
        </div>
      )}
    </form>
  );
}
