import { describe, expect, it } from "vitest";
import { budgetProgress, forecastMonth } from "./insights.ts";
import type { Category, PaymentMethod, Transaction } from "./ledger.ts";
import type { RecurringExpense } from "./recurring.ts";

const categories: Category[] = [
  { id: "food", parentId: null, name: "식비", kind: "expense", sortOrder: 0, archived: false },
  { id: "grocery", parentId: "food", name: "장보기", kind: "expense", sortOrder: 0, archived: false },
  { id: "finance", parentId: null, name: "금융", kind: "expense", sortOrder: 1, archived: false },
  { id: "bill", parentId: "finance", name: "카드대금", kind: "expense", sortOrder: 0, archived: false },
];
const card: PaymentMethod = { id: "card", type: "card", name: "신한", sortOrder: 0, archived: false, issuer: "신한카드", cardKind: "credit", last4: null, cycleStartOffset: -1, cycleStartDay: 1, cycleEndOffset: -1, cycleEndDay: 31, paymentDay: 14, holderMemberId: null, holderName: null };
const cash: PaymentMethod = { ...card, id: "cash", type: "cash", cardKind: null };
const methods = [cash, card];
const tx = (over: Partial<Transaction> = {}): Transaction => ({ id: "tx", kind: "expense", memberId: "member", paymentMethodId: "cash", counterparty: "마트", memo: null, amount: 10000, installmentMonths: 1, categoryId: "grocery", occurredAt: "2026-10-01T10:00", ...over });
const recurring = (over: Partial<RecurringExpense> = {}): RecurringExpense => ({ id: "rent", counterparty: "월세", memo: null, amount: 50000, paymentDay: 31, memberId: "member", paymentMethodId: "cash", categoryId: "grocery", endMonth: null, startMonth: "2026-01", lastGeneratedMonth: "2026-09", active: true, ...over });

describe("가계 예산과 현금 흐름", () => {
  it("예산은 할부 회차와 사용 기준으로 집계하고 카드대금을 제외한다", () => {
    const rows = [tx({ paymentMethodId: "card", amount: 90001, installmentMonths: 3, occurredAt: "2026-08-31T10:00" }), tx({ id: "bill", categoryId: "bill", amount: 30000 })];
    const [b] = budgetProgress([{ categoryId: "food", amount: 37500, month: "2026-10" }], rows, categories, methods, "2026-10");
    expect(b?.spent).toBe(30000); expect(b?.ratio).toBe(0.8);
  });
  it("고정지출의 미생성분과 카드대금만 월 잔액에서 추가 차감한다", () => {
    const rows = [tx({ id: "salary", kind: "income", amount: 200000 }), tx({ id: "card-use", paymentMethodId: "card", occurredAt: "2026-09-30T12:00", amount: 30000 })];
    const result = forecastMonth(rows, [recurring()], categories, methods, "2026-10", "2026-10-21");
    expect(result.balance).toBe(120000); expect(result.pending).toBe(80000);
    expect(result.events.map((e) => e.date)).toEqual(["2026-10-14", "2026-10-31"]);
  });
  it("생성된 고정지출, 기록된 카드대금과 삭제한 고정지출을 두 번 만들지 않는다", () => {
    const rows = [tx({ amount: 50000, recurringId: "rent" }), tx({ id: "usage", paymentMethodId: "card", occurredAt: "2026-09-05T10:00", amount: 30000 }), tx({ id: "paid", categoryId: "bill", settlementMethodId: "card", amount: 30000, occurredAt: "2026-10-14T00:00" })];
    expect(forecastMonth(rows, [recurring()], categories, methods, "2026-10", "2026-10-21").pending).toBe(0);
    expect(forecastMonth([], [recurring({ lastGeneratedMonth: "2026-10" })], categories, methods, "2026-10", "2026-10-21").pending).toBe(0);
  });
  it("체크카드는 사용일에 한 번만 출금하고 말일을 보정한다", () => {
    const check = { ...card, id: "check", cardKind: "check" as const };
    const result = forecastMonth([], [recurring({ paymentMethodId: "check", lastGeneratedMonth: "2026-01" })], categories, [check], "2026-02", "2026-02-01");
    expect(result.balance).toBe(-50000); expect(result.events[0]?.date).toBe("2026-02-28"); expect(result.events).toHaveLength(1);
  });
  it("신용카드 고정지출은 출금월에만 포함하고 예측에서 결제 정보 누락을 알린다", () => {
    const result = forecastMonth([], [recurring({ paymentMethodId: "card" })], categories, [card, { ...card, id: "missing", paymentDay: null }], "2026-10", "2026-10-01");
    expect(result.balance).toBe(0); expect(result.missingCards).toEqual(["신한"]);
  });
});
