import type { Category, LedgerEntry, PaymentMethod, Transaction } from "./ledger.ts";

export type ExpenseBasis = "usage" | "cash";
export interface ExpenseLookups {
  categories: Category[];
  paymentMethods: PaymentMethod[];
}

/** 이전 가계부의 금융/세금 > 카드대금과 Domo 기본 금융 > 카드대금을 구분한다. */
export function isCardPayment(categoryId: string, categories: Category[]): boolean {
  const child = categories.find((c) => c.id === categoryId);
  const parent = categories.find((c) => c.id === child?.parentId);
  return child?.name === "카드대금" && (parent?.name === "금융/세금" || parent?.name === "금융");
}

export function isCreditCard(method: Pick<PaymentMethod, "type" | "cardKind"> | undefined): boolean {
  return method?.type === "card" && method.cardKind !== "check";
}

/** 이미 사용 시 출금된 체크카드의 대금 정산은 두 번 지출로 잡지 않는다. */
export function isCheckCardPayment(t: Transaction, lookups: ExpenseLookups): boolean {
  if (t.kind !== "expense" || !isCardPayment(t.categoryId, lookups.categories)) return false;
  let method: PaymentMethod | undefined;
  if (t.settlementMethodId) {
    method = lookups.paymentMethods.find((m) => m.id === t.settlementMethodId);
  } else {
    // 이전 가계부에서 이관된 정산 메모의 확정된 형식. 카드명이 모호하면 임의로 제외하지 않는다.
    const match = /^(.+) 사용대금 \(\d{1,2}\/\d{1,2}~\d{1,2}\/\d{1,2}\)$/.exec(t.memo ?? "");
    if (!match) return false;
    const matches = lookups.paymentMethods.filter((m) => m.type === "card" && m.name === match[1]);
    if (matches.length === 1) method = matches[0];
  }
  return method?.type === "card" && method.cardKind === "check";
}

/** 신용카드 대금만 출금에 반영하며, 체크카드 대금은 중복 정산으로 제외한다. */
export function countsAsExpense(t: Transaction, lookups: ExpenseLookups, basis: ExpenseBasis): boolean {
  if (t.kind !== "expense") return false;
  if (isCardPayment(t.categoryId, lookups.categories)) return basis === "cash" && !isCheckCardPayment(t, lookups);
  return basis === "usage" || !isCreditCard(lookups.paymentMethods.find((m) => m.id === t.paymentMethodId));
}

export function summarizeEntries(entries: LedgerEntry[], lookups: ExpenseLookups) {
  let expense = 0;
  let realExpense = 0;
  let income = 0;
  for (const e of entries) {
    if (e.transaction.kind === "income") income += e.amount;
    else {
      if (countsAsExpense(e.transaction, lookups, "usage")) expense += e.amount;
      if (countsAsExpense(e.transaction, lookups, "cash")) realExpense += e.amount;
    }
  }
  return { expense, realExpense, income, balance: income - realExpense };
}
