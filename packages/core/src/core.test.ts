import { describe, expect, it } from "vitest";
import {
  addMonths,
  canEditTransaction,
  computeStats,
  eachDay,
  expandEntries,
  groupByDay,
  isNewerVersion,
  monthRange,
  shiftMonth,
  splitInstallment,
  totalsByKind,
  transactionInputSchema,
  allowsInstallment,
  billingCycle,
  cardBill,
  nextBillingCycle,
  paymentMethodInputSchema,
  paymentMethodLabel,
  type PaymentMethod,
  type Transaction,
} from "./index.ts";

const card: PaymentMethod = {
  id: "p1",
  type: "card",
  name: "신한",
  sortOrder: 0,
  archived: false,
  issuer: "신한카드",
  cardKind: "credit",
  last4: "1234",
  cycleStartOffset: -1,
  cycleStartDay: 1,
  cycleEndOffset: -1,
  cycleEndDay: 31,
  paymentDay: 14,
  holderMemberId: null,
  holderName: null,
};

const tx = (over: Partial<Transaction>): Transaction => ({
  id: "t1",
  kind: "expense",
  memberId: "m1",
  paymentMethodId: "p1",
  counterparty: "마트",
  memo: null,
  amount: 10000,
  installmentMonths: 1,
  categoryId: "c-child",
  occurredAt: "2026-10-15T12:00",
  ...over,
});

describe("dates", () => {
  it("월말을 보정하여 개월을 더한다", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31T09:30", 1)).toBe("2028-02-29T09:30");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("월 범위와 이동", () => {
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(eachDay({ start: "2026-10-30", end: "2026-11-02" })).toHaveLength(4);
  });
});

describe("할부", () => {
  it("나머지는 첫 회차에 더한다", () => {
    expect(splitInstallment(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(splitInstallment(90000, 3).reduce((a, b) => a + b)).toBe(90000);
  });
  it("회차를 해당 월에만 펼친다", () => {
    const t = tx({ amount: 90000, installmentMonths: 3, occurredAt: "2026-09-20T10:00" });
    expect(expandEntries([t], monthRange("2026-08"))).toHaveLength(0);
    const oct = expandEntries([t], monthRange("2026-10"));
    expect(oct).toHaveLength(1);
    expect(oct[0]).toMatchObject({ amount: 30000, occurredAt: "2026-10-20T10:00", installment: { index: 2, total: 3 } });
    expect(expandEntries([t], { start: "2026-09-01", end: "2026-12-31" })).toHaveLength(3);
  });
});

describe("목록", () => {
  it("일자별 최신순으로 묶고 합계를 낸다", () => {
    const entries = expandEntries(
      [
        tx({ id: "a", occurredAt: "2026-10-01T09:00", amount: 1000 }),
        tx({ id: "b", occurredAt: "2026-10-03T09:00", amount: 2000 }),
        tx({ id: "c", occurredAt: "2026-10-03T20:00", amount: 3000 }),
        tx({ id: "d", kind: "income", paymentMethodId: null, occurredAt: "2026-10-02T09:00", amount: 50000 }),
      ],
      monthRange("2026-10"),
    );
    const groups = groupByDay(entries.filter((e) => e.transaction.kind === "expense"));
    expect(groups.map((g) => g.date)).toEqual(["2026-10-03", "2026-10-01"]);
    expect(groups[0]!.entries.map((e) => e.key)).toEqual(["c", "b"]);
    expect(groups[0]!.total).toBe(5000);
    expect(totalsByKind(entries)).toEqual({ expense: 6000, income: 50000 });
  });
});

describe("통계", () => {
  it("대분류, 구성원, 수단, 일별로 집계한다", () => {
    const range = { start: "2026-10-01", end: "2026-10-03" };
    const entries = expandEntries(
      [tx({ id: "a", amount: 3000 }), tx({ id: "b", amount: 1000, memberId: "m2", occurredAt: "2026-10-02T10:00" })].map((t) =>
        t.id === "a" ? { ...t, occurredAt: "2026-10-01T10:00" } : t,
      ),
      range,
    );
    const stats = computeStats(entries, "expense", range, {
      categories: [
        { id: "c-parent", kind: "expense", parentId: null, name: "식비", sortOrder: 0, archived: false },
        { id: "c-child", kind: "expense", parentId: "c-parent", name: "장보기", sortOrder: 0, archived: false },
      ],
      members: [
        { id: "m1", userId: "u1", role: "owner", displayName: "아빠", color: "#000000", avatarUrl: null },
        { id: "m2", userId: "u2", role: "member", displayName: "엄마", color: "#ffffff", avatarUrl: null },
      ],
      paymentMethods: [card],
    });
    expect(stats.total).toBe(4000);
    expect(stats.byCategory[0]).toMatchObject({ label: "식비", amount: 4000, share: 1 });
    expect(stats.byCategory[0]!.children[0]).toMatchObject({ label: "장보기" });
    expect(stats.byMember.map((m) => m.label)).toEqual(["아빠", "엄마"]);
    expect(stats.byPaymentMethod[0]).toMatchObject({ label: "신한", amount: 4000 });
    expect(stats.daily.map((d) => d.amount)).toEqual([3000, 1000, 0]);
  });
});

describe("권한과 검증", () => {
  it("본인과 대표자만 수정한다", () => {
    expect(canEditTransaction({ memberId: "m1", role: "member" }, { memberId: "m1" })).toBe(true);
    expect(canEditTransaction({ memberId: "m2", role: "member" }, { memberId: "m1" })).toBe(false);
    expect(canEditTransaction({ memberId: "m2", role: "owner" }, { memberId: "m1" })).toBe(true);
  });
  it("지출은 지출수단이 필요하고 수입은 할부가 없다", () => {
    const base = {
      kind: "expense",
      paymentMethodId: null,
      counterparty: "마트",
      memo: null,
      amount: 1000,
      installmentMonths: 1,
      categoryId: "6f1c2b9e-1d2a-4b7a-9c3d-2a1b3c4d5e6f",
      occurredAt: "2026-10-01T10:00",
    };
    expect(transactionInputSchema.safeParse(base).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...base, kind: "income" }).success).toBe(true);
    expect(transactionInputSchema.safeParse({ ...base, kind: "income", installmentMonths: 3 }).success).toBe(false);
  });
  it("버전을 비교한다", () => {
    expect(isNewerVersion("v0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("v0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
  });
});

describe("카드 결제", () => {
  it("결제월 기준으로 집계 기간을 계산한다", () => {
    expect(billingCycle(card, "2026-11")).toEqual({ month: "2026-11", paymentDate: "2026-11-14", usage: { start: "2026-10-01", end: "2026-10-31" } });
    const split = { ...card, cycleStartOffset: -2, cycleStartDay: 14, cycleEndOffset: -1, cycleEndDay: 13, paymentDay: 31 };
    expect(billingCycle(split, "2027-02")).toEqual({ month: "2027-02", paymentDate: "2027-02-28", usage: { start: "2026-12-14", end: "2027-01-13" } });
  });
  it("결제일 당일까지는 이번 결제, 다음 날부터는 다음 결제", () => {
    expect(nextBillingCycle(card, "2026-10-14")?.month).toBe("2026-10");
    expect(nextBillingCycle(card, "2026-10-15")?.month).toBe("2026-11");
    expect(nextBillingCycle({ ...card, paymentDay: null }, "2026-10-15")).toBeNull();
  });
  it("할부 회차를 해당 명세서에 넣어 결제 예정 금액을 낸다", () => {
    const entries = expandEntries(
      [
        tx({ id: "a", amount: 90000, installmentMonths: 3, occurredAt: "2026-09-20T10:00" }),
        tx({ id: "b", amount: 5000, occurredAt: "2026-10-31T23:00" }),
        tx({ id: "c", amount: 7000, occurredAt: "2026-11-01T09:00" }),
        tx({ id: "d", amount: 1000, paymentMethodId: "other", occurredAt: "2026-10-05T09:00" }),
      ],
      { start: "2026-08-01", end: "2026-12-31" },
    );
    // 11월 14일 결제: 10월 사용분 = 할부 2회차 30,000 + 5,000
    expect(cardBill(entries, card, "2026-10-20")).toMatchObject({ month: "2026-11", amount: 35000, count: 2, inProgress: true });
    expect(cardBill(entries, card, "2026-11-03")).toMatchObject({ amount: 35000, inProgress: false });
  });
  it("카드 입력 규칙과 할부 허용", () => {
    const base = { type: "card", name: "", active: true, issuer: "신한카드", cardKind: "credit", last4: "1234", cycleStartOffset: -1, cycleStartDay: 1, cycleEndOffset: -1, cycleEndDay: 31, paymentDay: 14, holderMemberId: null, holderName: "아이" } as const;
    expect(paymentMethodInputSchema.safeParse(base).success).toBe(true);
    expect(paymentMethodInputSchema.safeParse({ ...base, paymentDay: null }).success).toBe(false);
    expect(paymentMethodInputSchema.safeParse({ ...base, last4: "12a4" }).success).toBe(false);
    expect(paymentMethodInputSchema.safeParse({ ...base, cycleStartOffset: 0 }).success).toBe(false);
    expect(paymentMethodLabel(base)).toBe("신한카드 1234");
    expect(allowsInstallment({ type: "card", cardKind: "check" })).toBe(false);
    expect(allowsInstallment({ type: "cash", cardKind: null })).toBe(false);
    expect(allowsInstallment({ type: "card", cardKind: "credit" })).toBe(true);
  });
});
