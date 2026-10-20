import { describe, expect, it } from "vitest";
import { cardBillForMonth, computeStats, expandEntries, isCheckCardPayment, monthRange, summarizeEntries, type Category, type PaymentMethod, type Transaction } from "./index.ts";

const categories: Category[] = [
  { id: "finance", parentId: null, name: "금융/세금", kind: "expense", sortOrder: 0, archived: false },
  { id: "bill", parentId: "finance", name: "카드대금", kind: "expense", sortOrder: 0, archived: false },
  { id: "food", parentId: null, name: "식비", kind: "expense", sortOrder: 0, archived: false },
];
const credit: PaymentMethod = { id: "credit", type: "card", cardKind: "credit", name: "신한", sortOrder: 0, archived: false, issuer: "신한카드", last4: "1234", cycleStartOffset: -1, cycleStartDay: 1, cycleEndOffset: -1, cycleEndDay: 31, paymentDay: 14, holderMemberId: null, holderName: null };
const methods: PaymentMethod[] = [credit, { ...credit, id: "check", name: "토스", cardKind: "check" }, { ...credit, id: "cash", type: "cash", cardKind: null }];
const lookups = { categories, paymentMethods: methods, members: [] };
const tx = (id: string, amount: number, method: string | null, categoryId = "food", overrides: Partial<Transaction> = {}): Transaction => ({ id, amount, paymentMethodId: method, categoryId, kind: "expense", memberId: "member", counterparty: "거래처", memo: null, installmentMonths: 1, occurredAt: "2026-10-10T12:00", ...overrides });

describe("사용액과 출금액", () => {
  const range = monthRange("2026-10");
  const entries = expandEntries([
    tx("credit", 30000, "credit"), tx("check", 20000, "check"), tx("cash", 10000, "cash"),
    tx("bill", 40000, "cash", "bill"), tx("income", 100000, null, "food", { kind: "income" }),
  ], range);
  it("신용카드 사용과 카드대금을 두 기준에 각각 한 번만 반영한다", () => {
    expect(summarizeEntries(entries, lookups)).toEqual({ expense: 60000, realExpense: 70000, income: 100000, balance: 30000 });
  });
  it("모든 통계 항목에 동일한 기준을 적용한다", () => {
    for (const basis of ["usage", "cash"] as const) {
      const stats = computeStats(entries, "expense", range, lookups, basis);
      expect(stats.total).toBe(basis === "usage" ? 60000 : 70000);
      expect(stats.count).toBe(3);
      for (const slices of [stats.byCategory, stats.byMember, stats.byPaymentMethod, stats.daily]) {
        expect(slices.reduce((s, r) => s + r.amount, 0)).toBe(stats.total);
      }
    }
  });
  it("카드 사용 월과 출금 월을 나누고 환불은 상쇄한다", () => {
    const transactions = [tx("use", 10000, "credit"), tx("cancel", -2000, "credit"), tx("paid", 8000, "cash", "bill", { occurredAt: "2026-11-14T00:00" })];
    expect(summarizeEntries(expandEntries(transactions, range), lookups)).toMatchObject({ expense: 8000, realExpense: 0 });
    expect(summarizeEntries(expandEntries(transactions, monthRange("2026-11")), lookups)).toMatchObject({ expense: 0, realExpense: 8000, balance: -8000 });
  });
  it("보관된 카드도 과거 사용의 실지출에서 제외한다", () => {
    expect(summarizeEntries(entries, { ...lookups, paymentMethods: methods.map((m) => ({ ...m, archived: true })) }).realExpense).toBe(70000);
  });
  it("체크카드 사용은 출금에 반영하고 과거에 따로 기록한 사용대금은 제외한다", () => {
    const transactions = [tx("use", 1294591, "check"), tx("check-bill", 410142, "cash", "bill", { memo: "토스 사용대금 (9/1~9/30)" }), tx("credit-bill", 40000, "cash", "bill", { memo: "신한 사용대금 (9/1~9/30)" })];
    const e = expandEntries(transactions, range);
    expect(summarizeEntries(e, lookups)).toMatchObject({ expense: 1294591, realExpense: 1334591 });
    const cash = computeStats(e, "expense", range, lookups, "cash");
    expect(cash.total).toBe(1334591);
    expect(cash.count).toBe(2);
    expect(cash.daily.reduce((sum, d) => sum + d.amount, 0)).toBe(cash.total);
  });
  it("정산 카드 ID가 있으면 이름 변경과 메모 편집 후에도 동일한 기준을 유지한다", () => {
    expect(isCheckCardPayment(tx("bill", 10000, "cash", "bill", { memo: "수정한 메모", settlementMethodId: "check" }), lookups)).toBe(true);
    expect(isCheckCardPayment(tx("bill", 10000, "cash", "bill", { memo: "토스 사용대금 (9/1~9/30)", settlementMethodId: "credit" }), lookups)).toBe(false);
  });
  it("새로 등록한 다른 체크카드에도 같은 출금과 중복 정산 규칙을 적용한다", () => {
    const newCard = { ...credit, id: "new-check", name: "새 체크카드", cardKind: "check" as const };
    const added = { ...lookups, paymentMethods: [...methods, newCard] };
    const e = expandEntries([tx("new-use", 25000, newCard.id), tx("new-bill", 25000, "cash", "bill", { settlementMethodId: newCard.id })], range);
    expect(summarizeEntries(e, added)).toMatchObject({ expense: 25000, realExpense: 25000 });
    expect(cardBillForMonth(e, newCard, "2026-11", "2026-11-01")).toBeNull();
  });
  it("카드명이 모호하거나 정산 형식이 아닌 메모는 추측해 제외하지 않는다", () => {
    const t = tx("bill", 10000, "cash", "bill", { memo: "토스 사용대금 (9/1~9/30)" });
    expect(isCheckCardPayment(t, { ...lookups, paymentMethods: [...methods, { ...credit, id: "other", name: "토스" }] })).toBe(false);
    expect(isCheckCardPayment({ ...t, memo: "토스" }, lookups)).toBe(false);
    expect(isCheckCardPayment({ ...t, categoryId: "food" }, lookups)).toBe(false);
  });
  it("체크카드는 카드 정산에서 제외하고 할부는 회차별로 정산한다", () => {
    const entries = expandEntries([tx("installment", 100000, "credit", "food", { installmentMonths: 3, occurredAt: "2026-08-31T10:00" }), tx("refund", -1000, "credit", "food", { occurredAt: "2026-09-15T10:00" })], monthRange("2026-09"));
    expect(cardBillForMonth(entries, credit, "2026-10", "2026-10-20")).toMatchObject({ amount: 32333, count: 2, paymentDate: "2026-10-14", inProgress: false });
    expect(cardBillForMonth(entries, methods[1]!, "2026-10", "2026-10-20")).toBeNull();
    expect(cardBillForMonth(entries, { ...credit, paymentDay: 31 }, "2027-02", "2027-02-28")?.paymentDate).toBe("2027-02-28");
  });
});
