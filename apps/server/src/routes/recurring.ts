import { dueRecurringMonths, nowLocalDateTime, recurringDate, recurringInputSchema, recurringStartMonth, type RecurringInput, type YearMonth } from "@domo/core";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.ts";
import { categories, householdMembers, paymentMethods, recurringAmountChanges, recurringExpenses, transactions } from "../db/schema.ts";
import { HttpError, parse, requireMember, type MemberRow } from "../http.ts";

type RecurringRow = typeof recurringExpenses.$inferSelect;

const toDto = (r: RecurringRow) => ({
  id: r.id,
  memberId: r.memberId,
  paymentMethodId: r.paymentMethodId,
  counterparty: r.counterparty,
  memo: r.memo,
  amount: r.amount,
  categoryId: r.categoryId,
  paymentDay: r.paymentDay,
  startMonth: r.startMonth as YearMonth,
  endMonth: r.endMonth as YearMonth | null,
  lastGeneratedMonth: r.lastGeneratedMonth as YearMonth | null,
  active: !r.archivedAt,
});

/**
 * 결제일이 된 고정지출을 지출 기록으로 만든다. 행 잠금으로 동시에 돌아도 같은 달을 두 번 만들지 않는다.
 * today 는 테스트에서 날짜를 바꿔 넣기 위한 값이다.
 */
export async function generateRecurring(db: Db, today = nowLocalDateTime().slice(0, 10), householdId?: string) {
  const candidates = await db
    .select({ id: recurringExpenses.id })
    .from(recurringExpenses)
    .where(householdId ? and(isNull(recurringExpenses.archivedAt), eq(recurringExpenses.householdId, householdId)) : isNull(recurringExpenses.archivedAt));
  let created = 0;
  for (const { id } of candidates) {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(recurringExpenses).where(eq(recurringExpenses.id, id)).for("update");
      if (!row) return;
      const months = dueRecurringMonths(toDto(row), today);
      if (months.length === 0) return;
      await tx.insert(transactions).values(
        months.map((month) => ({
          householdId: row.householdId,
          memberId: row.memberId,
          kind: "expense" as const,
          paymentMethodId: row.paymentMethodId,
          counterparty: row.counterparty,
          memo: row.memo,
          amount: row.amount,
          installmentMonths: 1,
          categoryId: row.categoryId,
          occurredAt: `${recurringDate(month, row.paymentDay)} 00:00:00`,
          recurringId: row.id,
        })),
      );
      await tx.update(recurringExpenses).set({ lastGeneratedMonth: months.at(-1)! }).where(eq(recurringExpenses.id, id));
      created += months.length;
    });
  }
  return created;
}

export async function recurringRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** 지출자, 지출수단, 소분류가 이 가계 소속인지 확인한다. */
  async function assertRefs(me: MemberRow, input: RecurringInput) {
    const [member] = await db.select().from(householdMembers).where(and(eq(householdMembers.id, input.memberId), eq(householdMembers.householdId, me.householdId)));
    if (!member) throw new HttpError(400, "지출자를 다시 선택해 주세요.");
    const [method] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.householdId, me.householdId)));
    if (!method) throw new HttpError(400, "지출수단을 다시 선택해 주세요.");
    const [category] = await db.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.householdId, me.householdId)));
    if (!category || category.kind !== "expense" || !category.parentId) throw new HttpError(400, "소분류를 다시 선택해 주세요.");
  }

  async function owned(me: MemberRow, id: string) {
    const [row] = await db.select().from(recurringExpenses).where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.householdId, me.householdId)));
    if (!row) throw new HttpError(404, "고정지출을 찾을 수 없습니다.");
    return row;
  }

  const values = (input: RecurringInput) => ({
    memberId: input.memberId,
    paymentMethodId: input.paymentMethodId,
    counterparty: input.counterparty,
    memo: input.memo || null,
    amount: input.amount,
    categoryId: input.categoryId,
    paymentDay: input.paymentDay,
    endMonth: input.endMonth,
    archivedAt: input.active ? null : new Date(),
  });

  app.get("/api/recurring", async (req) => {
    const me = await requireMember(db, req);
    const rows = await db.select().from(recurringExpenses).where(eq(recurringExpenses.householdId, me.householdId)).orderBy(asc(recurringExpenses.paymentDay), asc(recurringExpenses.createdAt));
    return rows.map(toDto);
  });

  app.post("/api/recurring", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(recurringInputSchema, req.body);
    await assertRefs(me, input);
    const today = nowLocalDateTime().slice(0, 10);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(recurringExpenses)
        .values({ ...values(input), householdId: me.householdId, startMonth: recurringStartMonth(input.paymentDay, today) })
        .returning();
      await tx.insert(recurringAmountChanges).values({ recurringId: created!.id, memberId: me.id, oldAmount: null, newAmount: input.amount });
      return created;
    });
    await generateRecurring(db, today, me.householdId);
    return { id: row!.id };
  });

  app.put<{ Params: { id: string } }>("/api/recurring/:id", async (req) => {
    const me = await requireMember(db, req);
    const current = await owned(me, req.params.id);
    const input = parse(recurringInputSchema, req.body);
    await assertRefs(me, input);
    const today = nowLocalDateTime().slice(0, 10);
    // 멈췄던 고정지출을 다시 켜면 멈춘 동안의 달은 건너뛰고 지금부터 다시 시작한다.
    const restart = !!current.archivedAt && input.active ? { startMonth: recurringStartMonth(input.paymentDay, today), lastGeneratedMonth: null } : {};
    await db.transaction(async (tx) => {
      await tx.update(recurringExpenses).set({ ...values(input), ...restart }).where(eq(recurringExpenses.id, current.id));
      if (current.amount !== input.amount) {
        await tx.insert(recurringAmountChanges).values({ recurringId: current.id, memberId: me.id, oldAmount: current.amount, newAmount: input.amount });
      }
    });
    await generateRecurring(db, today, me.householdId);
    return { ok: true };
  });

  /** 금액 이력: 이 고정지출로 생성된 월별 기록과 금액 변경 기록 */
  app.get<{ Params: { id: string } }>("/api/recurring/:id/history", async (req) => {
    const me = await requireMember(db, req);
    const current = await owned(me, req.params.id);
    const [records, changes] = await Promise.all([
      db
        .select({ transactionId: transactions.id, occurredAt: transactions.occurredAt, amount: transactions.amount, createdAt: transactions.createdAt })
        .from(transactions)
        .where(eq(transactions.recurringId, current.id))
        .orderBy(asc(transactions.occurredAt)),
      db.select().from(recurringAmountChanges).where(eq(recurringAmountChanges.recurringId, current.id)).orderBy(asc(recurringAmountChanges.changedAt)),
    ]);
    return {
      records: records.map((r) => ({ ...r, occurredAt: r.occurredAt.slice(0, 16).replace(" ", "T"), createdAt: r.createdAt.toISOString() })),
      changes: changes.map((c) => ({ id: c.id, oldAmount: c.oldAmount, newAmount: c.newAmount, memberId: c.memberId, changedAt: c.changedAt.toISOString() })),
    };
  });

  /** 이미 만든 기록은 남기고 연결만 끊는다(외래 키 set null). */
  app.delete<{ Params: { id: string } }>("/api/recurring/:id", async (req) => {
    const me = await requireMember(db, req);
    const current = await owned(me, req.params.id);
    await db.delete(recurringExpenses).where(eq(recurringExpenses.id, current.id));
    return { ok: true };
  });
}
