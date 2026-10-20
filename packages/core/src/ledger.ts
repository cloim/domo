import { addMonths, type DateRange, isWithin } from "./dates.ts";
import type { MemberRole, PaymentMethodType, TransactionKind } from "./schemas.ts";

export interface Transaction {
  id: string;
  kind: TransactionKind;
  memberId: string;
  paymentMethodId: string | null;
  counterparty: string;
  memo: string | null;
  amount: number;
  installmentMonths: number;
  categoryId: string;
  occurredAt: string;
}

export interface Member {
  id: string;
  userId: string;
  role: MemberRole;
  displayName: string;
  color: string;
  avatarUrl: string | null;
}

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  name: string;
  sortOrder: number;
  archived: boolean;
}

export interface Category {
  id: string;
  kind: TransactionKind;
  parentId: string | null;
  name: string;
  sortOrder: number;
  archived: boolean;
}

/** 화면과 통계가 다루는 한 줄. 할부 거래는 회차마다 하나씩 만들어진다. */
export interface LedgerEntry {
  key: string;
  transaction: Transaction;
  amount: number;
  occurredAt: string;
  installment: { index: number; total: number } | null;
}

/** 나머지 원 단위는 첫 회차에 더한다(카드사 관례). */
export function splitInstallment(amount: number, months: number): number[] {
  const base = Math.floor(amount / months);
  const parts = Array.from({ length: months }, () => base);
  parts[0] = amount - base * (months - 1);
  return parts;
}

export function expandEntries(transactions: Transaction[], range: DateRange): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const tx of transactions) {
    if (tx.installmentMonths <= 1) {
      if (isWithin(tx.occurredAt, range)) {
        entries.push({ key: tx.id, transaction: tx, amount: tx.amount, occurredAt: tx.occurredAt, installment: null });
      }
      continue;
    }
    splitInstallment(tx.amount, tx.installmentMonths).forEach((amount, i) => {
      const occurredAt = addMonths(tx.occurredAt, i);
      if (isWithin(occurredAt, range)) {
        entries.push({
          key: `${tx.id}:${i + 1}`,
          transaction: tx,
          amount,
          occurredAt,
          installment: { index: i + 1, total: tx.installmentMonths },
        });
      }
    });
  }
  return entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export interface DayGroup {
  date: string;
  total: number;
  entries: LedgerEntry[];
}

/** 최신 날짜가 먼저 오도록 일자별로 묶는다. 입력 순서와 무관하게 정렬한다. */
export function groupByDay(entries: LedgerEntry[]): DayGroup[] {
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const groups: DayGroup[] = [];
  for (const entry of sorted) {
    const date = entry.occurredAt.slice(0, 10);
    let group = groups.at(-1);
    if (!group || group.date !== date) {
      group = { date, total: 0, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
    group.total += entry.amount;
  }
  return groups;
}

export function totalsByKind(entries: LedgerEntry[]): Record<TransactionKind, number> {
  const totals: Record<TransactionKind, number> = { expense: 0, income: 0 };
  for (const e of entries) totals[e.transaction.kind] += e.amount;
  return totals;
}

export interface Actor {
  memberId: string;
  role: MemberRole;
}

/** 모든 구성원이 조회하고, 수정과 삭제는 작성자 본인과 대표자만 한다. */
export function canEditTransaction(actor: Actor, tx: Pick<Transaction, "memberId">): boolean {
  return actor.role === "owner" || actor.memberId === tx.memberId;
}

export function canManageHousehold(actor: Actor): boolean {
  return actor.role === "owner";
}
