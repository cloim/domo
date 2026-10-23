import { z } from "zod";

export const transactionKinds = ["expense", "income"] as const;
export type TransactionKind = (typeof transactionKinds)[number];

export const paymentMethodTypes = ["cash", "card"] as const;
export type PaymentMethodType = (typeof paymentMethodTypes)[number];

export const memberRoles = ["owner", "member"] as const;
export type MemberRole = (typeof memberRoles)[number];

export const MAX_INSTALLMENT_MONTHS = 36;

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "일시 형식은 YYYY-MM-DDTHH:mm 입니다.");
const name = z.string().trim().min(1, "이름을 입력해 주세요.").max(40);

export const transactionInputSchema = z
  .object({
    kind: z.enum(transactionKinds),
    paymentMethodId: z.string().uuid().nullable(),
    counterparty: z.string().trim().min(1, "거래처를 입력해 주세요.").max(60),
    memo: z.string().trim().max(200).nullable(),
    amount: z.number().int().positive("금액은 0보다 커야 합니다.").max(10_000_000_000),
    installmentMonths: z.number().int().min(1).max(MAX_INSTALLMENT_MONTHS),
    categoryId: z.string().uuid(),
    occurredAt: localDateTime,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "expense" && !v.paymentMethodId) {
      ctx.addIssue({ code: "custom", path: ["paymentMethodId"], message: "지출수단을 선택해 주세요." });
    }
    if (v.kind === "income" && (v.paymentMethodId || v.installmentMonths !== 1)) {
      ctx.addIssue({ code: "custom", path: ["paymentMethodId"], message: "수입에는 지출수단과 할부가 없습니다." });
    }
  });
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const cardKinds = ["credit", "check"] as const;
export type CardKind = (typeof cardKinds)[number];

/** 결제월 기준 개월 차이. -2 전전월, -1 전월, 0 당월 */
const monthOffset = z.number().int().min(-2).max(0);
/** 1~31, 31은 말일 */
const dayOfMonth = z.number().int().min(1).max(31);

/** 지출수단 생성과 수정. 카드는 부가 정보를 함께 받고, 현금은 별칭과 사용 여부만 받는다. */
export const paymentMethodInputSchema = z
  .object({
    type: z.enum(paymentMethodTypes),
    name: z.string().trim().max(40),
    active: z.boolean(),
    issuer: z.string().trim().max(30).nullable(),
    cardKind: z.enum(cardKinds).nullable(),
    last4: z.string().regex(/^\d{4}$/, "끝번호는 숫자 4자리입니다.").nullable(),
    cycleStartOffset: monthOffset.nullable(),
    cycleStartDay: dayOfMonth.nullable(),
    cycleEndOffset: monthOffset.nullable(),
    cycleEndDay: dayOfMonth.nullable(),
    paymentDay: dayOfMonth.nullable(),
    holderMemberId: z.string().uuid().nullable(),
    holderName: z.string().trim().max(30).nullable(),
    monthlyTargetAmount: z.number().int().positive("월 목표 금액은 0보다 커야 합니다.").max(10_000_000_000).nullable().optional(),
    targetExcludedCounterparties: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "cash") {
      if (!v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "별칭을 입력해 주세요." });
      return;
    }
    if (!v.issuer) ctx.addIssue({ code: "custom", path: ["issuer"], message: "카드사를 선택해 주세요." });
    if (!v.cardKind) ctx.addIssue({ code: "custom", path: ["cardKind"], message: "카드 종류를 선택해 주세요." });
    const billing = [v.cycleStartOffset, v.cycleStartDay, v.cycleEndOffset, v.cycleEndDay, v.paymentDay];
    if (billing.some((x) => x === null) && billing.some((x) => x !== null)) {
      ctx.addIssue({ code: "custom", path: ["paymentDay"], message: "집계 기간과 결제일은 함께 입력해 주세요." });
    }
    if (v.cycleStartOffset !== null && v.cycleEndOffset !== null && v.cycleStartDay !== null && v.cycleEndDay !== null) {
      if (v.cycleStartOffset * 100 + v.cycleStartDay > v.cycleEndOffset * 100 + v.cycleEndDay) {
        ctx.addIssue({ code: "custom", path: ["cycleEndDay"], message: "집계 종료일이 시작일보다 앞섭니다." });
      }
    }
    if (v.holderMemberId && v.holderName) ctx.addIssue({ code: "custom", path: ["holderName"], message: "명의자는 하나만 지정해 주세요." });
  });
export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;

/** 별칭을 비우면 카드사와 끝번호로 만든다. */
export function paymentMethodLabel(v: Pick<PaymentMethodInput, "name" | "issuer" | "last4">): string {
  return v.name || [v.issuer, v.last4].filter(Boolean).join(" ") || "카드";
}

export const categoryInputSchema = z.object({
  kind: z.enum(transactionKinds),
  parentId: z.string().uuid().nullable(),
  name,
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const householdInputSchema = z.object({ name });

export const joinInputSchema = z.object({ code: z.string().trim().min(4).max(32) });

export const memberUpdateSchema = z.object({
  displayName: name.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });
