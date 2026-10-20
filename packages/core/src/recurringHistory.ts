import type { YearMonth } from "./dates.ts";

export interface RecurringMonthRecord {
  transactionId: string;
  occurredAt: string;
  amount: number;
  /** 기록이 만들어진 시각(ISO). 그때의 설정 금액과 비교한다. */
  createdAt: string;
}

export interface RecurringAmountChange {
  id: string;
  /** 등록일 때는 null */
  oldAmount: number | null;
  newAmount: number;
  memberId: string | null;
  changedAt: string;
}

export type RecurringTimelineItem =
  | { type: "month"; month: YearMonth; transactionId: string; amount: number; diff: number | null; editedOnlyThisMonth: boolean }
  | { type: "change"; id: string; date: string; oldAmount: number | null; newAmount: number; memberId: string | null };

/**
 * 시점 t의 설정 금액. t 이전 마지막 변경의 새 금액, 없으면 첫 변경의 이전 금액,
 * 변경 기록이 아예 없으면 현재 설정 금액이다.
 */
export function amountAt(changes: RecurringAmountChange[], t: string, currentAmount: number): number {
  const sorted = [...changes].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const before = sorted.filter((c) => c.changedAt <= t).at(-1);
  if (before) return before.newAmount;
  return sorted[0]?.oldAmount ?? sorted[0]?.newAmount ?? currentAmount;
}

/** 월별 실제 금액과 설정 변경을 최신순 한 줄로 합친다. */
export function buildRecurringTimeline(records: RecurringMonthRecord[], changes: RecurringAmountChange[], currentAmount: number): RecurringTimelineItem[] {
  const months = [...records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const items: (RecurringTimelineItem & { sortKey: string })[] = months.map((r, i) => ({
    type: "month",
    month: r.occurredAt.slice(0, 7) as YearMonth,
    transactionId: r.transactionId,
    amount: r.amount,
    diff: i === 0 ? null : r.amount - months[i - 1]!.amount,
    editedOnlyThisMonth: r.amount !== amountAt(changes, r.createdAt, currentAmount),
    sortKey: r.createdAt,
  }));
  for (const c of changes) {
    items.push({ type: "change", id: c.id, date: c.changedAt.slice(0, 10), oldAmount: c.oldAmount, newAmount: c.newAmount, memberId: c.memberId, sortKey: c.changedAt });
  }
  return items.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).map(({ sortKey: _, ...item }) => item as RecurringTimelineItem);
}
