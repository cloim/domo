import { canEditTransaction, categoryInputSchema, paymentMethodInputSchema, reorderSchema, transactionInputSchema, type TransactionInput } from "@domo/core";
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { categories, paymentMethods, transactions } from "../db/schema.ts";
import { HttpError, parse, requireMember, type MemberRow } from "../http.ts";

const rangeSchema = z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

const toDto = (t: typeof transactions.$inferSelect) => ({
  id: t.id,
  kind: t.kind,
  memberId: t.memberId,
  paymentMethodId: t.paymentMethodId,
  counterparty: t.counterparty,
  memo: t.memo,
  amount: t.amount,
  installmentMonths: t.installmentMonths,
  categoryId: t.categoryId,
  // DB 문자열 "2026-10-20 09:30:00" 을 화면 형식으로 맞춘다.
  occurredAt: t.occurredAt.slice(0, 16).replace(" ", "T"),
});

export async function ledgerRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** 입력값의 분류와 지출수단이 이 가계 소속이며 종류가 맞는지 확인한다. */
  async function assertRefs(me: MemberRow, input: TransactionInput) {
    const [category] = await db.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.householdId, me.householdId)));
    if (!category || category.kind !== input.kind || !category.parentId) throw new HttpError(400, "소분류를 다시 선택해 주세요.");
    if (input.paymentMethodId) {
      const [method] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.householdId, me.householdId)));
      if (!method) throw new HttpError(400, "지출수단을 다시 선택해 주세요.");
      if (method.type === "cash" && input.installmentMonths !== 1) throw new HttpError(400, "할부는 카드에서만 가능합니다.");
    }
  }

  async function ownedTransaction(me: MemberRow, id: string) {
    const [row] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.householdId, me.householdId)));
    if (!row) throw new HttpError(404, "기록을 찾을 수 없습니다.");
    if (!canEditTransaction({ memberId: me.id, role: me.role }, row)) throw new HttpError(403, "본인이 작성한 기록만 수정할 수 있습니다.");
    return row;
  }

  /** 기간과 겹치는 원거래를 돌려준다. 할부는 이전 달 결제분도 포함되며, 회차 펼치기는 클라이언트(core)가 맡는다. */
  app.get("/api/transactions", async (req) => {
    const me = await requireMember(db, req);
    const { start, end } = parse(rangeSchema, req.query);
    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, me.householdId),
          lte(transactions.occurredAt, `${end} 23:59:59`),
          gte(sql`${transactions.occurredAt} + make_interval(months => ${transactions.installmentMonths} - 1)`, sql`${start}::timestamp`),
        ),
      );
    return rows.map(toDto);
  });

  app.post("/api/transactions", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(transactionInputSchema, req.body);
    await assertRefs(me, input);
    const [row] = await db.insert(transactions).values({ ...input, householdId: me.householdId, memberId: me.id }).returning();
    return toDto(row!);
  });

  app.patch<{ Params: { id: string } }>("/api/transactions/:id", async (req) => {
    const me = await requireMember(db, req);
    await ownedTransaction(me, req.params.id);
    const input = parse(transactionInputSchema, req.body);
    await assertRefs(me, input);
    const [row] = await db.update(transactions).set(input).where(eq(transactions.id, req.params.id)).returning();
    return toDto(row!);
  });

  app.delete<{ Params: { id: string } }>("/api/transactions/:id", async (req) => {
    const me = await requireMember(db, req);
    await ownedTransaction(me, req.params.id);
    await db.delete(transactions).where(eq(transactions.id, req.params.id));
    return { ok: true };
  });

  // 지출수단과 분류는 모든 구성원이 관리한다. 기록에서 쓰인 항목은 지우지 않고 보관하여 과거 내역을 지킨다.

  app.post("/api/payment-methods", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(paymentMethodInputSchema, req.body);
    const [{ n }] = (await db.select({ n: count() }).from(paymentMethods).where(eq(paymentMethods.householdId, me.householdId))) as [{ n: number }];
    const [row] = await db.insert(paymentMethods).values({ ...input, householdId: me.householdId, sortOrder: n }).returning();
    return { id: row!.id };
  });

  app.patch<{ Params: { id: string } }>("/api/payment-methods/:id", async (req) => {
    const me = await requireMember(db, req);
    const { name, archived } = parse(z.object({ name: z.string().trim().min(1).max(40).optional(), archived: z.boolean().optional() }), req.body);
    await db
      .update(paymentMethods)
      .set({ ...(name ? { name } : {}), ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
      .where(and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.householdId, me.householdId)));
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/payment-methods/:id", async (req) => {
    const me = await requireMember(db, req);
    const where = and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.householdId, me.householdId));
    const [active] = await db.select({ n: count() }).from(paymentMethods).where(and(eq(paymentMethods.householdId, me.householdId), isNull(paymentMethods.archivedAt)));
    if (active!.n <= 1) throw new HttpError(400, "지출수단은 최소 하나가 필요합니다.");
    const [used] = await db.select({ n: count() }).from(transactions).where(eq(transactions.paymentMethodId, req.params.id));
    if (used!.n > 0) {
      await db.update(paymentMethods).set({ archivedAt: new Date() }).where(where);
      return { archived: true };
    }
    await db.delete(paymentMethods).where(where);
    return { archived: false };
  });

  app.put("/api/payment-methods/order", async (req) => {
    const me = await requireMember(db, req);
    const { ids } = parse(reorderSchema, req.body);
    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(paymentMethods).set({ sortOrder: i }).where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, me.householdId)));
      }
    });
    return { ok: true };
  });

  app.post("/api/categories", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(categoryInputSchema, req.body);
    if (input.parentId) {
      const [parent] = await db.select().from(categories).where(and(eq(categories.id, input.parentId), eq(categories.householdId, me.householdId)));
      if (!parent || parent.parentId || parent.kind !== input.kind) throw new HttpError(400, "대분류를 다시 선택해 주세요.");
    }
    const siblings = input.parentId ? eq(categories.parentId, input.parentId) : and(isNull(categories.parentId), eq(categories.kind, input.kind));
    const [{ n }] = (await db.select({ n: count() }).from(categories).where(and(eq(categories.householdId, me.householdId), siblings))) as [{ n: number }];
    const [row] = await db.insert(categories).values({ ...input, householdId: me.householdId, sortOrder: n }).returning();
    return { id: row!.id };
  });

  app.patch<{ Params: { id: string } }>("/api/categories/:id", async (req) => {
    const me = await requireMember(db, req);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(40) }), req.body);
    await db.update(categories).set({ name }).where(and(eq(categories.id, req.params.id), eq(categories.householdId, me.householdId)));
    return { ok: true };
  });

  /** 대분류를 지우면 소분류도 함께 정리한다. 쓰인 분류는 보관 처리한다. */
  app.delete<{ Params: { id: string } }>("/api/categories/:id", async (req) => {
    const me = await requireMember(db, req);
    const [target] = await db.select().from(categories).where(and(eq(categories.id, req.params.id), eq(categories.householdId, me.householdId)));
    if (!target) throw new HttpError(404, "분류를 찾을 수 없습니다.");
    const ids = target.parentId ? [target.id] : [target.id, ...(await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, target.id))).map((c) => c.id)];
    let archived = false;
    await db.transaction(async (tx) => {
      // 자식부터 지워야 parent_id 참조가 끊기지 않는다.
      for (const id of [...ids].reverse()) {
        const [used] = await tx.select({ n: count() }).from(transactions).where(eq(transactions.categoryId, id));
        const [children] = await tx.select({ n: count() }).from(categories).where(eq(categories.parentId, id));
        if (used!.n > 0 || children!.n > 0) {
          await tx.update(categories).set({ archivedAt: new Date() }).where(eq(categories.id, id));
          archived = true;
        } else {
          await tx.delete(categories).where(eq(categories.id, id));
        }
      }
    });
    return { archived };
  });

  app.put("/api/categories/order", async (req) => {
    const me = await requireMember(db, req);
    const { ids } = parse(reorderSchema, req.body);
    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(categories).set({ sortOrder: i }).where(and(eq(categories.id, id), eq(categories.householdId, me.householdId)));
      }
    });
    return { ok: true };
  });
}

