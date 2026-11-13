import { currentYearMonth, isWithin, nowLocalDateTime, shiftMonth, type DateRange, type PaymentMethod, type Transaction } from "@domo/core";

export function defaultReconciliationRange(now = new Date()): DateRange {
  return { start: `${shiftMonth(currentYearMonth(now), -1)}-01`, end: nowLocalDateTime(now).slice(0, 10) };
}

/** 지출수단 오등록도 확인하도록 모든 지출 원거래를 실제 지출일과 전체 금액으로 비교한다. */
export function reconciliationTransactions(transactions: Transaction[], methods: PaymentMethod[], range: DateRange): Transaction[] {
  const names = new Map(methods.map((m) => [m.id, m.name]));
  return transactions.filter((t) => t.kind === "expense" && isWithin(t.occurredAt, range))
    .sort((a, b) => (names.get(a.paymentMethodId ?? "") ?? "미지정").localeCompare(names.get(b.paymentMethodId ?? "") ?? "미지정", "ko") || a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}
