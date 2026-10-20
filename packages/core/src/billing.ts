import { daysInMonth, parseDate, shiftMonth, toDateString, type DateRange, type YearMonth } from "./dates.ts";
import type { LedgerEntry, PaymentMethod } from "./ledger.ts";
import { isCreditCard } from "./summary.ts";

export interface BillingCycle {
  /** 결제월 */
  month: YearMonth;
  paymentDate: string;
  usage: DateRange;
}

export interface CardBill extends BillingCycle {
  amount: number;
  count: number;
  /** 사용 기간이 아직 끝나지 않았다. */
  inProgress: boolean;
}

type Billing = Pick<PaymentMethod, "cycleStartOffset" | "cycleStartDay" | "cycleEndOffset" | "cycleEndDay" | "paymentDay">;

/** 31은 말일로 본다. 그 달에 없는 날은 말일로 맞춘다. */
function dayIn(ym: YearMonth, day: number): string {
  const { year, month } = parseDate(`${ym}-01`);
  return toDateString(year, month, Math.min(day, daysInMonth(year, month)));
}

export function hasBilling(m: Billing): m is { [K in keyof Billing]: number } {
  return m.cycleStartOffset !== null && m.cycleStartDay !== null && m.cycleEndOffset !== null && m.cycleEndDay !== null && m.paymentDay !== null;
}

export function billingCycle(m: Billing, month: YearMonth): BillingCycle | null {
  if (!hasBilling(m)) return null;
  return {
    month,
    paymentDate: dayIn(month, m.paymentDay),
    usage: { start: dayIn(shiftMonth(month, m.cycleStartOffset), m.cycleStartDay), end: dayIn(shiftMonth(month, m.cycleEndOffset), m.cycleEndDay) },
  };
}

/** 오늘 이후 가장 가까운 결제일의 집계 기간. 결제 당일은 이번 결제로 본다. */
export function nextBillingCycle(m: Billing, today: string): BillingCycle | null {
  const thisMonth = today.slice(0, 7) as YearMonth;
  const current = billingCycle(m, thisMonth);
  if (!current) return null;
  return today <= current.paymentDate ? current : billingCycle(m, shiftMonth(thisMonth, 1));
}

/** 집계 기간에 들어오는 이 카드의 기록 합계. 할부는 회차별 날짜로 펼친 항목을 넘겨야 한다. */
export function cardBill(entries: LedgerEntry[], method: PaymentMethod, today: string): CardBill | null {
  if (!isCreditCard(method)) return null;
  const cycle = nextBillingCycle(method, today);
  if (!cycle) return null;
  return cardBillForMonth(entries, method, cycle.month, today);
}

export function cardBillForMonth(entries: LedgerEntry[], method: PaymentMethod, month: YearMonth, today: string): CardBill | null {
  if (!isCreditCard(method)) return null;
  const cycle = billingCycle(method, month);
  if (!cycle) return null;
  let amount = 0;
  let count = 0;
  for (const e of entries) {
    const day = e.occurredAt.slice(0, 10);
    if (e.transaction.kind === "expense" && e.transaction.paymentMethodId === method.id && day >= cycle.usage.start && day <= cycle.usage.end) {
      amount += e.amount;
      count += 1;
    }
  }
  return { ...cycle, amount, count, inProgress: today <= cycle.usage.end };
}

export interface CardSettlement extends BillingCycle {
  paymentMethodId: string;
  name: string;
  amount: number;
  count: number;
  inProgress: boolean;
  recorded: boolean;
}

/** 결제 예정 금액 계산에 필요한 기록 조회 범위. 집계 시작은 최대 전전월이다. */
export function billingLookupRange(today: string): DateRange {
  const ym = today.slice(0, 7) as YearMonth;
  return { start: `${shiftMonth(ym, -2)}-01`, end: dayIn(shiftMonth(ym, 1), 31) };
}
