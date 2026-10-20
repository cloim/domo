import { budgetProgress, nowLocalDateTime, type YearMonth } from "@domo/core";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { budgetAlerts, budgets, categories, paymentMethods, transactionComments, transactionReactions, transactions } from "../db/schema.ts";
import { HttpError, parse, requireMember } from "../http.ts";

const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).transform((m) => m as YearMonth);
const uuid = z.string().uuid();
const dto = (t: typeof transactions.$inferSelect) => ({ ...t, occurredAt: t.occurredAt.slice(0, 16).replace(" ", "T") });

export async function familyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get("/api/budgets", async (req) => {
    const me = await requireMember(db, req);
    const { month } = parse(z.object({ month: monthSchema }), req.query);
    return db.select().from(budgets).where(and(eq(budgets.householdId, me.householdId), eq(budgets.month, month)));
  });

  app.put("/api/budgets", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(z.object({ month: monthSchema, categoryId: uuid, amount: z.number().int().min(0).max(10_000_000_000) }), req.body);
    const [cat] = await db.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.householdId, me.householdId)));
    if (!cat || cat.kind !== "expense" || cat.parentId || cat.archivedAt) throw new HttpError(400, "사용 중인 지출 대분류를 선택해 주세요.");
    const where = and(eq(budgets.householdId, me.householdId), eq(budgets.month, input.month), eq(budgets.categoryId, input.categoryId));
    if (!input.amount) await db.delete(budgets).where(where);
    else await db.insert(budgets).values({ ...input, householdId: me.householdId }).onConflictDoUpdate({ target: [budgets.householdId, budgets.month, budgets.categoryId], set: { amount: input.amount } });
    return { ok: true };
  });

  app.get("/api/family", async (req) => {
    const me = await requireMember(db, req);
    const rows = await db.select().from(transactions).where(eq(transactions.householdId, me.householdId)).orderBy(desc(transactions.createdAt), desc(transactions.id)).limit(40);
    const ids = rows.map((r) => r.id);
    const [comments, reactions, alerts] = await Promise.all([
      ids.length ? db.select().from(transactionComments).where(inArray(transactionComments.transactionId, ids)).orderBy(transactionComments.createdAt) : [],
      ids.length ? db.select().from(transactionReactions).where(inArray(transactionReactions.transactionId, ids)) : [],
      db.select().from(budgetAlerts).where(eq(budgetAlerts.householdId, me.householdId)).orderBy(desc(budgetAlerts.createdAt)).limit(20),
    ]);
    return { records: rows.map(dto), comments, reactions, alerts };
  });

  // 가계 공유 알림을 한 번만 만든다. 읽기 API는 상태를 변경하지 않는다.
  app.post("/api/budgets/check", async (req) => {
    const me = await requireMember(db, req);
    const month = nowLocalDateTime().slice(0, 7) as YearMonth;
    const [bs, cats, methods, rows] = await Promise.all([
      db.select().from(budgets).where(and(eq(budgets.householdId, me.householdId), eq(budgets.month, month))),
      db.select().from(categories).where(eq(categories.householdId, me.householdId)),
      db.select().from(paymentMethods).where(eq(paymentMethods.householdId, me.householdId)),
      db.select().from(transactions).where(eq(transactions.householdId, me.householdId)),
    ]);
    const progress = budgetProgress(bs.map((b) => ({ ...b, month })), rows.map(dto), cats.map((c) => ({ ...c, archived: !!c.archivedAt })), methods.map((m) => ({ ...m, archived: !!m.archivedAt })), month);
    for (const b of progress.filter((b) => b.ratio >= 0.8)) await db.insert(budgetAlerts).values({ householdId: me.householdId, month, categoryId: b.categoryId, amount: b.amount, spent: b.spent }).onConflictDoNothing();
    return { ok: true };
  });

  async function ownHouseholdTransaction(householdId: string, rawId: string) {
    const id = parse(uuid, rawId);
    const [row] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, id), eq(transactions.householdId, householdId)));
    if (!row) throw new HttpError(404, "기록을 찾을 수 없습니다.");
    return id;
  }

  app.post<{ Params: { id: string } }>("/api/transactions/:id/comments", async (req) => {
    const me = await requireMember(db, req);
    const id = await ownHouseholdTransaction(me.householdId, req.params.id);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(300) }), req.body);
    const [row] = await db.insert(transactionComments).values({ transactionId: id, memberId: me.id, body }).returning();
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/comments/:id", async (req) => {
    const me = await requireMember(db, req);
    const id = parse(uuid, req.params.id);
    const [row] = await db.select().from(transactionComments).where(eq(transactionComments.id, id));
    if (!row) throw new HttpError(404, "댓글을 찾을 수 없습니다.");
    await ownHouseholdTransaction(me.householdId, row.transactionId);
    if (row.memberId !== me.id && me.role !== "owner") throw new HttpError(403, "본인 댓글을 삭제할 수 있습니다.");
    await db.delete(transactionComments).where(eq(transactionComments.id, id));
    return { ok: true };
  });

  app.put<{ Params: { id: string } }>("/api/transactions/:id/reaction", async (req) => {
    const me = await requireMember(db, req);
    const id = await ownHouseholdTransaction(me.householdId, req.params.id);
    const { reaction } = parse(z.object({ reaction: z.enum(["like", "thanks"]).nullable() }), req.body);
    if (!reaction) await db.delete(transactionReactions).where(and(eq(transactionReactions.transactionId, id), eq(transactionReactions.memberId, me.id)));
    else await db.insert(transactionReactions).values({ transactionId: id, memberId: me.id, reaction }).onConflictDoUpdate({ target: [transactionReactions.transactionId, transactionReactions.memberId], set: { reaction } });
    return { ok: true };
  });
}
