import { z } from "zod";
import { daysInMonth, parseDate, shiftMonth, toDateString, type YearMonth } from "./dates.ts";

const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, "종료월 형식은 YYYY-MM 입니다.");

export const recurringInputSchema = z.object({
  counterparty: z.string().trim().min(1, "지출처를 입력해 주세요.").max(60),
  memo: z.string().trim().max(200).nullable(),
  amount: z.number().int().positive("금액은 0보다 커야 합니다.").max(10_000_000_000),
  /** 1~31, 31은 말일 */
  paymentDay: z.number().int().min(1).max(31),
  memberId: z.string().uuid("지출자를 선택해 주세요."),
  paymentMethodId: z.string().uuid("지출수단을 선택해 주세요."),
  categoryId: z.string().uuid("소분류를 선택해 주세요."),
  endMonth: yearMonth.nullable(),
  active: z.boolean(),
});
export type RecurringInput = z.infer<typeof recurringInputSchema>;

export interface RecurringExpense extends Omit<RecurringInput, "endMonth"> {
  id: string;
  endMonth: YearMonth | null;
  startMonth: YearMonth;
  lastGeneratedMonth: YearMonth | null;
}

/** 그 달의 결제일. 없는 날은 말일로 맞춘다. */
export function recurringDate(month: YearMonth, paymentDay: number): string {
  const { year, month: m } = parseDate(`${month}-01`);
  return toDateString(year, m, Math.min(paymentDay, daysInMonth(year, m)));
}

/** 등록할 때 첫 생성 월. 이번 달 결제일이 이미 지났으면 다음 달부터다. */
export function recurringStartMonth(paymentDay: number, today: string): YearMonth {
  const thisMonth = today.slice(0, 7) as YearMonth;
  return today <= recurringDate(thisMonth, paymentDay) ? thisMonth : shiftMonth(thisMonth, 1);
}

/** 오늘까지 결제일이 지났지만 아직 만들지 않은 달. 오래된 달부터 돌려준다. */
export function dueRecurringMonths(
  item: Pick<RecurringExpense, "paymentDay" | "startMonth" | "endMonth" | "lastGeneratedMonth" | "active">,
  today: string,
): YearMonth[] {
  if (!item.active) return [];
  const thisMonth = today.slice(0, 7) as YearMonth;
  const months: YearMonth[] = [];
  let month = item.lastGeneratedMonth && item.lastGeneratedMonth >= item.startMonth ? shiftMonth(item.lastGeneratedMonth, 1) : item.startMonth;
  while (month <= thisMonth && (!item.endMonth || month <= item.endMonth)) {
    if (recurringDate(month, item.paymentDay) <= today) months.push(month);
    month = shiftMonth(month, 1);
  }
  return months;
}

/** 다음에 만들어질 날짜. 멈췄거나 종료월이 지났으면 null */
export function nextRecurringDate(item: Pick<RecurringExpense, "paymentDay" | "startMonth" | "endMonth" | "lastGeneratedMonth" | "active">): string | null {
  if (!item.active) return null;
  const month = item.lastGeneratedMonth && item.lastGeneratedMonth >= item.startMonth ? shiftMonth(item.lastGeneratedMonth, 1) : item.startMonth;
  if (item.endMonth && month > item.endMonth) return null;
  return recurringDate(month, item.paymentDay);
}
