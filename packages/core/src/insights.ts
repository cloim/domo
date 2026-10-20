import { cardBillForMonth, hasBilling } from "./billing.ts";
import { monthRange, type YearMonth } from "./dates.ts";
import { expandEntries, type Transaction, type Category, type PaymentMethod } from "./ledger.ts";
import { recurringDate, type RecurringExpense } from "./recurring.ts";
import { countsAsExpense, isCardPayment, isCreditCard, summarizeEntries } from "./summary.ts";

export interface Budget { categoryId: string; amount: number; month: YearMonth }
export function budgetProgress(budgets: Budget[], txs: Transaction[], categories: Category[], paymentMethods: PaymentMethod[], month: YearMonth) {
  const spent = new Map<string, number>();
  for (const e of expandEntries(txs, monthRange(month))) {
    if (!countsAsExpense(e.transaction, { categories, paymentMethods }, "usage")) continue;
    const category = categories.find((c) => c.id === e.transaction.categoryId);
    const parentId = category?.parentId ?? category?.id;
    if (parentId) spent.set(parentId, (spent.get(parentId) ?? 0) + e.amount);
  }
  return budgets.filter((b) => b.month === month).map((b) => ({ ...b, spent: spent.get(b.categoryId) ?? 0, ratio: (spent.get(b.categoryId) ?? 0) / b.amount }));
}

/** 월 수입과 출금 차이에 아직 기록되지 않은 지출만 더한다. 계좌 잔고 예측과 구분한다. */
export function forecastMonth(txs: Transaction[], recurring: RecurringExpense[], categories: Category[], paymentMethods: PaymentMethod[], month: YearMonth, today: string) {
  const range = monthRange(month);
  const known = expandEntries(txs, range);
  const lookups = { categories, paymentMethods };
  const pending: { key: string; date: string; label: string; amount: number; estimated: boolean }[] = [];
  const projected: Transaction[] = [];
  for (const r of recurring) {
    if (!r.active || r.startMonth > month || r.endMonth && r.endMonth < month || r.lastGeneratedMonth && r.lastGeneratedMonth >= month) continue;
    if (known.some((e) => e.transaction.recurringId === r.id)) continue;
    const t: Transaction = { ...r, id: `recurring:${r.id}`, kind: "expense", installmentMonths: 1, occurredAt: `${recurringDate(month, r.paymentDay)}T00:00`, recurringId: r.id };
    projected.push(t);
    if (countsAsExpense(t, lookups, "cash")) pending.push({ key: t.id, date: t.occurredAt.slice(0, 10), label: r.counterparty, amount: r.amount, estimated: true });
  }
  const billTransactions = [...txs, ...projected];
  const billEntries = expandEntries(billTransactions, { start: billTransactions.map((t) => t.occurredAt.slice(0, 10)).sort()[0] ?? range.start, end: range.end });
  for (const m of paymentMethods.filter((p) => isCreditCard(p) && !p.archived)) {
    const bill = cardBillForMonth(billEntries, m, month, today);
    if (!bill || bill.amount <= 0) continue;
    const paid = known.some((e) => isCardPayment(e.transaction.categoryId, categories) &&
      (e.transaction.settlementMethodId === m.id ||
        e.occurredAt.slice(0, 10) === bill.paymentDate && e.amount === bill.amount &&
        (e.transaction.counterparty === m.name || e.transaction.counterparty === m.issuer)));
    if (!paid) pending.push({ key: `card:${m.id}`, date: bill.paymentDate, label: `${m.name} 카드대금`, amount: bill.amount, estimated: true });
  }
  const recorded = known.filter((e) => e.occurredAt.slice(0, 10) >= today && countsAsExpense(e.transaction, lookups, "cash")).map((e) => ({ key: e.key, date: e.occurredAt.slice(0, 10), label: e.transaction.counterparty, amount: e.amount, estimated: false }));
  return { balance: summarizeEntries(known, lookups).balance - pending.reduce((s, p) => s + p.amount, 0), pending: pending.reduce((s, p) => s + p.amount, 0), events: [...pending, ...recorded].sort((a, b) => a.date.localeCompare(b.date)), missingCards: paymentMethods.filter((m) => !m.archived && isCreditCard(m) && !hasBilling(m)).map((m) => m.name) };
}
