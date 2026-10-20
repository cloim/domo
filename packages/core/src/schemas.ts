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

export const paymentMethodInputSchema = z.object({
  type: z.enum(paymentMethodTypes),
  name,
});
export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;

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
