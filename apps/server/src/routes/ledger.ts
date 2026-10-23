import {
  allowsInstallment,
  canEditTransaction,
  categoryInputSchema,
  paymentMethodInputSchema,
  paymentMethodLabel,
  reorderSchema,
  transactionInputSchema,
  billingCycle,
  cardBillForMonth,
  expandEntries,
  isCardPayment,
  isCreditCard,
  nowLocalDateTime,
  monthRange,
  type CardSettlement,
  type YearMonth,
  type PaymentMethodInput,
  type TransactionInput,
} from "@domo/core";
import { and, count, desc, eq, gte, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { categories, householdMembers, paymentMethods, recurringExpenses, transactions, notifyDevices, notifyRegistrations } from "../db/schema.ts";
import { HttpError, parse, requireMember, userIdOf, type MemberRow } from "../http.ts";

const rangeSchema = z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const settlementMonth = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).transform((s) => s as YearMonth);

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
  recurringId: t.recurringId,
  settlementMethodId: t.settlementMethodId,
});

export async function ledgerRoutes(app: FastifyInstance, { db }: { db: Db }) {
  async function settlementCandidates(executor: Pick<Db, "select">, householdId: string, month: YearMonth) {
    const methods = await executor.select().from(paymentMethods).where(eq(paymentMethods.householdId, householdId));
    const cats = await executor.select().from(categories).where(eq(categories.householdId, householdId));
    const cards = methods.filter(isCreditCard);
    const cycles = cards.map((m) => billingCycle(m, month)).filter((c) => c !== null);
    if (!cycles.length) return [];
    const start = cycles.map((c) => c.usage.start).sort()[0]!;
    const end = cycles.map((c) => c.usage.end).sort().at(-1)!;
    const rows = await executor.select().from(transactions).where(and(
      eq(transactions.householdId, householdId),
      lte(transactions.occurredAt, `${end} 23:59:59`),
      gte(transactions.lastInstallmentAt, `${start} 00:00:00`),
    ));
    const entries = expandEntries(rows.map(toDto), { start, end });
    const period = monthRange(month);
    const paid = await executor.select().from(transactions).where(and(eq(transactions.householdId, householdId),
      or(eq(transactions.settlementMonth, month), and(gte(transactions.occurredAt, `${period.start} 00:00:00`), lte(transactions.occurredAt, `${period.end} 23:59:59`)))));
    const today = nowLocalDateTime().slice(0, 10);
    const result: CardSettlement[] = [];
    for (const card of cards) {
      const bill = cardBillForMonth(entries, { ...card, archived: !!card.archivedAt }, month, today);
      if (!bill || bill.amount <= 0) continue;
      // 이관되었거나 수동으로 입력한 같은 카드의 대금도 다시 만들지 않는다.
      const recorded = paid.some((t) => (t.settlementMethodId === card.id && t.settlementMonth === month) ||
        (t.kind === "expense" && isCardPayment(t.categoryId, cats.map((c) => ({ ...c, archived: !!c.archivedAt }))) &&
          t.amount === bill.amount && t.occurredAt.slice(0, 10) === bill.paymentDate &&
          (t.counterparty === card.name || t.counterparty === card.issuer)));
      result.push({ ...bill, paymentMethodId: card.id, name: card.name, recorded });
    }
    return result;
  }

  app.get("/api/settlements/cards", async (req) => {
    const me = await requireMember(db, req);
    const { month } = parse(z.object({ month: settlementMonth }), req.query);
    return settlementCandidates(db, me.householdId, month);
  });

  app.post("/api/settlements/cards", async (req) => {
    const me = await requireMember(db, req);
    const { month, paymentMethodIds } = parse(z.object({ month: settlementMonth, paymentMethodIds: z.array(z.string().uuid()).min(1).max(100) }), req.body);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${me.householdId}))`);
      const candidates = await settlementCandidates(tx, me.householdId, month);
      const selected = [...new Set(paymentMethodIds)].map((id) => candidates.find((c) => c.paymentMethodId === id));
      if (selected.some((c) => !c)) throw new HttpError(400, "정산 대상을 다시 확인해 주세요.");
      const targets = selected.filter((c): c is CardSettlement => !!c && !c.recorded);
      if (targets.some((c) => c.inProgress)) throw new HttpError(400, "사용 기간이 끝난 뒤 정산해 주세요.");
      if (!targets.length) return { created: 0 };
      const methods = await tx.select().from(paymentMethods).where(eq(paymentMethods.householdId, me.householdId));
      const cash = methods.find((m) => m.type === "cash" && !m.archivedAt);
      if (!cash) throw new HttpError(400, "사용 중인 현금 지출수단을 추가해 주세요.");
      const cats = await tx.select().from(categories).where(eq(categories.householdId, me.householdId));
      let category = cats.find((c) => isCardPayment(c.id, cats.map((cat) => ({ ...cat, archived: !!cat.archivedAt }))));
      if (!category) {
        let parent = cats.find((c) => c.kind === "expense" && !c.parentId && (c.name === "금융/세금" || c.name === "금융"));
        if (!parent) [parent] = await tx.insert(categories).values({ householdId: me.householdId, kind: "expense", name: "금융/세금" }).returning();
        [category] = await tx.insert(categories).values({ householdId: me.householdId, kind: "expense", parentId: parent!.id, name: "카드대금" }).returning();
      }
      for (const target of targets) {
        const card = methods.find((m) => m.id === target.paymentMethodId)!;
        await tx.insert(transactions).values({ householdId: me.householdId, memberId: me.id, kind: "expense",
          paymentMethodId: cash.id, categoryId: category!.id, counterparty: card.name,
          memo: `${target.usage.start} ~ ${target.usage.end} 사용대금`, amount: target.amount,
          occurredAt: `${target.paymentDate}T00:00`, settlementMethodId: card.id, settlementMonth: month,
        });
      }
      return { created: targets.length };
    });
  });

  /** 입력값의 분류와 지출수단이 이 가계 소속이며 종류가 맞는지 확인한다. */
  async function assertRefs(me: MemberRow, input: TransactionInput) {
    const [category] = await db.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.householdId, me.householdId)));
    if (!category || category.kind !== input.kind || !category.parentId) throw new HttpError(400, "소분류를 다시 선택해 주세요.");
    if (input.paymentMethodId) {
      const [method] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.householdId, me.householdId)));
      if (!method) throw new HttpError(400, "지출수단을 다시 선택해 주세요.");
      if (!allowsInstallment(method) && input.installmentMonths !== 1) throw new HttpError(400, "할부는 신용카드에서만 가능합니다.");
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
          gte(transactions.lastInstallmentAt, `${start} 00:00:00`),
        ),
      );
    return rows.map(toDto);
  });

  /** 같은 거래처의 가장 최근 기록으로 분류와 지출수단을 추천한다(알림 등록 화면용). */
  app.get("/api/transactions/all", async (req) => {
    const me = await requireMember(db, req);
    return (await db.select().from(transactions).where(eq(transactions.householdId, me.householdId)).orderBy(desc(transactions.occurredAt))).map(toDto);
  });

  app.get("/api/transactions/suggestions", async (req) => {
    const me = await requireMember(db, req);
    const rows = await db.select().from(transactions).where(eq(transactions.householdId, me.householdId)).orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));
    const found = new Map<string, { counterparty: string; kind: "expense" | "income"; categoryId: string; paymentMethodId: string | null; amount: number; frequency: number; recent: string }>();
    for (const t of rows) {
      const key = `${t.kind}:${t.counterparty}`;
      const previous = found.get(key);
      if (previous) previous.frequency++;
      else found.set(key, { counterparty: t.counterparty, kind: t.kind, categoryId: t.categoryId, paymentMethodId: t.paymentMethodId, amount: t.amount, frequency: 1, recent: t.occurredAt });
    }
    return [...found.values()].sort((a, b) => b.frequency - a.frequency || b.recent.localeCompare(a.recent));
  });

  app.get("/api/transactions/suggest", async (req) => {
    const me = await requireMember(db, req);
    const { counterparty, kind } = parse(z.object({ counterparty: z.string().trim().min(1).max(60), kind: z.enum(["expense", "income"]) }), req.query);
    const [row] = await db
      .select({ categoryId: transactions.categoryId, paymentMethodId: transactions.paymentMethodId })
      .from(transactions)
      .where(and(eq(transactions.householdId, me.householdId), eq(transactions.kind, kind), eq(transactions.counterparty, counterparty)))
      .orderBy(desc(transactions.occurredAt))
      .limit(1);
    return row ?? { categoryId: null, paymentMethodId: null };
  });

  app.post("/api/transactions", async (req) => {
    const me = await requireMember(db, req);
    const { pendingId, ...input } = parse(transactionInputSchema.extend({ pendingId: z.string().min(1).max(101).optional() }), req.body);
    await assertRefs(me, input);
    if (pendingId) return db.transaction(async (tx) => {
      // 같은 알림을 PC와 휴대폰에서 동시에 처리해도 거래는 하나만 만든다.
      const [pending] = await tx.select({ registration: notifyRegistrations }).from(notifyRegistrations)
        .innerJoin(notifyDevices, eq(notifyDevices.id, notifyRegistrations.deviceId))
        .where(and(eq(notifyRegistrations.id, pendingId), eq(notifyDevices.userId, userIdOf(req))))
        .for("update", { of: notifyRegistrations });
      if (!pending) throw new HttpError(404, "대기 건을 찾을 수 없습니다.");
      const r = pending.registration;
      if (r.status === "registered" && r.transactionId) {
        const [saved] = await tx.select().from(transactions).where(and(eq(transactions.id, r.transactionId), eq(transactions.householdId, me.householdId)));
        if (saved) return toDto(saved);
      }
      if (r.status !== "pending") throw new HttpError(409, "이미 처리된 알림입니다. 대기 목록을 새로 확인해 주세요.");
      const [saved] = await tx.insert(transactions).values({ ...input, householdId: me.householdId, memberId: me.id }).returning();
      await tx.update(notifyRegistrations).set({ status: "registered", transactionId: saved!.id }).where(eq(notifyRegistrations.id, pendingId));
      return toDto(saved!);
    });
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

  /** 입력값을 저장할 컬럼으로 바꾼다. 현금은 카드 속성을 비운다. */
  async function methodValues(me: MemberRow, input: PaymentMethodInput) {
    if (input.holderMemberId) {
      const [holder] = await db.select().from(householdMembers).where(and(eq(householdMembers.id, input.holderMemberId), eq(householdMembers.householdId, me.householdId)));
      if (!holder) throw new HttpError(400, "명의자를 다시 선택해 주세요.");
    }
    const card = input.type === "card";
    return {
      type: input.type,
      name: paymentMethodLabel(input),
      archivedAt: input.active ? null : new Date(),
      issuer: card ? input.issuer : null,
      cardKind: card ? input.cardKind : null,
      last4: card ? input.last4 : null,
      cycleStartOffset: card ? input.cycleStartOffset : null,
      cycleStartDay: card ? input.cycleStartDay : null,
      cycleEndOffset: card ? input.cycleEndOffset : null,
      cycleEndDay: card ? input.cycleEndDay : null,
      paymentDay: card ? input.paymentDay : null,
      holderMemberId: card ? input.holderMemberId : null,
      holderName: card ? input.holderName || null : null,
      monthlyTargetAmount: card ? input.monthlyTargetAmount : null,
      targetExcludedCounterparties: card ? input.targetExcludedCounterparties : [],
    };
  }

  // 승인월의 승인금액 전액을 집계한다. 할부 회차와 카드 청구 기간은 사용하지 않는다.
  app.post<{ Params: { id: string } }>("/api/payment-methods/:id/target-status", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(z.object({
      amount: z.number().int().positive().max(10_000_000_000),
      occurredAt: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}T\d{2}:\d{2}$/),
      counterparty: z.string().trim().max(60).nullable(),
    }), req.body);
    const [method] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.householdId, me.householdId)));
    if (!method) throw new HttpError(404, "지출수단을 찾을 수 없습니다.");
    const target = method.monthlyTargetAmount;
    const excluded = method.targetExcludedCounterparties;
    if (method.type !== "card" || target === null || (input.counterparty !== null && excluded.includes(input.counterparty))) return { message: null };
    const month = input.occurredAt.slice(0, 7) as YearMonth;
    const range = monthRange(month);
    const [row] = await db.select({ spent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::float8` }).from(transactions).where(and(
      eq(transactions.householdId, me.householdId), eq(transactions.paymentMethodId, method.id), eq(transactions.kind, "expense"),
      isNull(transactions.settlementMethodId), gte(transactions.occurredAt, `${range.start}T00:00`), lte(transactions.occurredAt, `${range.end}T23:59:59.999999`),
      excluded.length ? notInArray(transactions.counterparty, excluded) : undefined,
    ));
    const spent = Number(row!.spent) + input.amount;
    return { target, spent, message: spent >= target ? `월 목표 금액을 초과했어요. ${method.name} ${month} 사용액 ${spent.toLocaleString("ko-KR")}원 / 목표 ${target.toLocaleString("ko-KR")}원 (이번 지출 포함)` : null };
  });

  async function activeMethodCount(householdId: string) {
    const [row] = await db.select({ n: count() }).from(paymentMethods).where(and(eq(paymentMethods.householdId, householdId), isNull(paymentMethods.archivedAt)));
    return row!.n;
  }

  app.post("/api/payment-methods", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(paymentMethodInputSchema, req.body);
    const [{ n }] = (await db.select({ n: count() }).from(paymentMethods).where(eq(paymentMethods.householdId, me.householdId))) as [{ n: number }];
    const [row] = await db.insert(paymentMethods).values({ ...(await methodValues(me, input)), householdId: me.householdId, sortOrder: n }).returning();
    return { id: row!.id };
  });

  app.put<{ Params: { id: string } }>("/api/payment-methods/:id", async (req) => {
    const me = await requireMember(db, req);
    const input = parse(paymentMethodInputSchema, req.body);
    const where = and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.householdId, me.householdId));
    const [current] = await db.select().from(paymentMethods).where(where);
    if (!current) throw new HttpError(404, "지출수단을 찾을 수 없습니다.");
    if (current.type !== input.type) throw new HttpError(400, "지출수단 유형은 바꿀 수 없습니다.");
    if (!input.active && !current.archivedAt && (await activeMethodCount(me.householdId)) <= 1) throw new HttpError(400, "사용 중인 지출수단이 최소 하나는 있어야 합니다.");
    await db.update(paymentMethods).set(await methodValues(me, input)).where(where);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/payment-methods/:id", async (req) => {
    const me = await requireMember(db, req);
    const where = and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.householdId, me.householdId));
    const [target] = await db.select().from(paymentMethods).where(where);
    if (!target) throw new HttpError(404, "지출수단을 찾을 수 없습니다.");
    if (!target.archivedAt && (await activeMethodCount(me.householdId)) <= 1) throw new HttpError(400, "사용 중인 지출수단이 최소 하나는 있어야 합니다.");
    const [used] = await db.select({ n: count() }).from(transactions).where(or(eq(transactions.paymentMethodId, req.params.id), eq(transactions.settlementMethodId, req.params.id)));
    const [fixed] = await db.select({ n: count() }).from(recurringExpenses).where(eq(recurringExpenses.paymentMethodId, req.params.id));
    if (used!.n + fixed!.n > 0) {
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
        const [fixed] = await tx.select({ n: count() }).from(recurringExpenses).where(eq(recurringExpenses.categoryId, id));
        const [children] = await tx.select({ n: count() }).from(categories).where(eq(categories.parentId, id));
        if (used!.n > 0 || fixed!.n > 0 || children!.n > 0) {
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

