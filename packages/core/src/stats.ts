import { type DateRange, eachDay } from "./dates.ts";
import type { Category, LedgerEntry, Member, PaymentMethod } from "./ledger.ts";
import type { TransactionKind } from "./schemas.ts";
import { countsAsExpense, type ExpenseBasis } from "./summary.ts";

export interface StatSlice {
  id: string;
  label: string;
  amount: number;
  /** 0~1 */
  share: number;
  color?: string;
}

export interface CategoryStat extends StatSlice {
  children: StatSlice[];
}

export interface PeriodStats {
  kind: TransactionKind;
  total: number;
  count: number;
  byCategory: CategoryStat[];
  byMember: StatSlice[];
  byPaymentMethod: StatSlice[];
  daily: { date: string; amount: number }[];
}

interface Lookups {
  categories: Category[];
  members: Member[];
  paymentMethods: PaymentMethod[];
}

function toSlices(sums: Map<string, number>, total: number, label: (id: string) => string, color?: (id: string) => string | undefined): StatSlice[] {
  return [...sums.entries()]
    .map(([id, amount]) => ({ id, label: label(id), amount, share: total ? amount / total : 0, color: color?.(id) }))
    .sort((a, b) => b.amount - a.amount);
}

function add(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function computeStats(entries: LedgerEntry[], kind: TransactionKind, range: DateRange, lookups: Lookups, basis: ExpenseBasis = "usage"): PeriodStats {
  const scoped = entries.filter((e) => kind === "income" ? e.transaction.kind === "income" : countsAsExpense(e.transaction, lookups, basis));
  const total = scoped.reduce((s, e) => s + e.amount, 0);
  const categoryById = new Map(lookups.categories.map((c) => [c.id, c]));

  const byParent = new Map<string, number>();
  const byChild = new Map<string, Map<string, number>>();
  const byMember = new Map<string, number>();
  const byMethod = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const e of scoped) {
    const child = categoryById.get(e.transaction.categoryId);
    const parentId = child?.parentId ?? child?.id ?? "unknown";
    add(byParent, parentId, e.amount);
    if (!byChild.has(parentId)) byChild.set(parentId, new Map());
    add(byChild.get(parentId)!, e.transaction.categoryId, e.amount);
    add(byMember, e.transaction.memberId, e.amount);
    if (e.transaction.paymentMethodId) add(byMethod, e.transaction.paymentMethodId, e.amount);
    add(byDay, e.occurredAt.slice(0, 10), e.amount);
  }

  const categoryName = (id: string) => categoryById.get(id)?.name ?? "미분류";
  const memberById = new Map(lookups.members.map((m) => [m.id, m]));
  const methodById = new Map(lookups.paymentMethods.map((p) => [p.id, p]));

  return {
    kind,
    total,
    count: scoped.length,
    byCategory: toSlices(byParent, total, categoryName).map((slice) => {
      const childSums = byChild.get(slice.id) ?? new Map<string, number>();
      return { ...slice, children: toSlices(childSums, slice.amount, categoryName) };
    }),
    byMember: toSlices(byMember, total, (id) => memberById.get(id)?.displayName ?? "알 수 없음", (id) => memberById.get(id)?.color),
    byPaymentMethod: toSlices(byMethod, total, (id) => methodById.get(id)?.name ?? "알 수 없음"),
    daily: eachDay(range).map((date) => ({ date, amount: byDay.get(date) ?? 0 })),
  };
}
