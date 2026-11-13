import { describe, expect, it } from "vitest";
import type { PaymentMethod, Transaction } from "@domo/core";
import { defaultReconciliationRange, reconciliationTransactions } from "./cardReconciliation.ts";

const method = (id: string, name: string, overrides: Partial<PaymentMethod> = {}): PaymentMethod => ({ id, name, type: "card", cardKind: "credit", archived: false, sortOrder: 0, issuer: null, last4: null, cycleStartOffset: null, cycleStartDay: null, cycleEndOffset: null, cycleEndDay: null, paymentDay: null, holderMemberId: null, holderName: null, ...overrides });
const transaction = (id: string, paymentMethodId: string | null, occurredAt: string, overrides: Partial<Transaction> = {}): Transaction => ({ id, paymentMethodId, occurredAt, kind: "expense", memberId: "member", counterparty: "지출처", memo: null, amount: 10000, installmentMonths: 1, categoryId: "category", ...overrides });

describe("카드내역 대사", () => {
  it("오늘부터 지난달 1일까지 기본 기간을 잡고 연도 경계를 처리한다", () => {
    expect(defaultReconciliationRange(new Date(2026, 10, 13))).toEqual({ start: "2026-10-01", end: "2026-11-13" });
    expect(defaultReconciliationRange(new Date(2027, 0, 31))).toEqual({ start: "2026-12-01", end: "2027-01-31" });
    expect(defaultReconciliationRange(new Date(2028, 2, 31))).toEqual({ start: "2028-02-01", end: "2028-03-31" });
  });

  it("현금과 미지정을 포함한 모든 지출을 조회하고 기간 양끝과 지출수단, 일시 정렬을 적용한다", () => {
    const methods = [method("b", "나 카드", { cardKind: "check" }), method("a", "가 카드", { archived: true }), method("cash", "현금", { type: "cash", cardKind: null })];
    const txs = [
      transaction("check", "b", "2026-10-01T00:00"),
      transaction("late", "a", "2026-11-13T23:59", { amount: 300000, installmentMonths: 3 }),
      transaction("early", "a", "2026-10-01T00:00"),
      transaction("old-installment", "a", "2026-09-30T23:59", { installmentMonths: 12 }),
      transaction("future", "a", "2026-11-14T00:00"),
      transaction("income", "a", "2026-10-01T00:00", { kind: "income" }),
      transaction("cash", "cash", "2026-10-01T00:00"),
      transaction("none", null, "2026-10-01T00:00"),
    ];
    const rows = reconciliationTransactions(txs, methods, { start: "2026-10-01", end: "2026-11-13" });
    expect(rows.map((t) => t.id)).toEqual(["early", "late", "check", "none", "cash"]);
    expect(rows.reduce((sum, t) => sum + t.amount, 0)).toBe(340000);
    expect(txs[0]?.id).toBe("check");
  });
});
