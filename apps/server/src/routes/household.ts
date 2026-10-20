import { randomInt } from "node:crypto";
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, householdInputSchema, joinInputSchema, MEMBER_COLORS, memberUpdateSchema } from "@domo/core";
import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.ts";
import type { Db } from "../db/client.ts";
import { categories, householdMembers, households, invites, paymentMethods, transactions, users } from "../db/schema.ts";
import { HttpError, parse, requireMember, requireOwner, userIdOf } from "../http.ts";

const INVITE_DAYS = 7;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

export async function householdRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }) {
  const memberColumns = {
    id: householdMembers.id,
    userId: householdMembers.userId,
    role: householdMembers.role,
    displayName: householdMembers.displayName,
    color: householdMembers.color,
    avatarUrl: users.avatarUrl,
    email: users.email,
  };

  async function memberCount(householdId: string) {
    const [row] = await db.select({ n: count() }).from(householdMembers).where(eq(householdMembers.householdId, householdId));
    return row?.n ?? 0;
  }

  app.get("/api/me", async (req) => {
    const userId = userIdOf(req);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new HttpError(401, "로그인이 필요합니다.");
    const [member] = await db.select().from(householdMembers).where(eq(householdMembers.userId, userId));
    return {
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      member: member ? { id: member.id, role: member.role, householdId: member.householdId } : null,
    };
  });

  app.post("/api/households", async (req) => {
    const userId = userIdOf(req);
    const { name } = parse(householdInputSchema, req.body);
    const [existing] = await db.select().from(householdMembers).where(eq(householdMembers.userId, userId));
    if (existing) throw new HttpError(409, "이미 참여 중인 가계가 있습니다.");
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    return db.transaction(async (tx) => {
      const [household] = await tx.insert(households).values({ name, createdBy: userId }).returning();
      const householdId = household!.id;
      await tx.insert(householdMembers).values({ householdId, userId, role: "owner", displayName: user!.name, color: MEMBER_COLORS[0]! });
      await tx.insert(paymentMethods).values(DEFAULT_PAYMENT_METHODS.map((p, i) => ({ ...p, householdId, sortOrder: i })));
      for (const [kind, groups] of Object.entries(DEFAULT_CATEGORIES) as [keyof typeof DEFAULT_CATEGORIES, [string, string[]][]][]) {
        for (const [i, [parentName, children]] of groups.entries()) {
          const [parent] = await tx.insert(categories).values({ householdId, kind, name: parentName, sortOrder: i }).returning();
          await tx.insert(categories).values(children.map((child, j) => ({ householdId, kind, parentId: parent!.id, name: child, sortOrder: j })));
        }
      }
      return { id: householdId, name };
    });
  });

  /** 화면들이 공유하는 기준 정보. 한 번 받아 클라이언트에서 재사용한다. */
  app.get("/api/household", async (req) => {
    const me = await requireMember(db, req);
    const [household] = await db.select().from(households).where(eq(households.id, me.householdId));
    const [members, methods, cats] = await Promise.all([
      db.select(memberColumns).from(householdMembers).innerJoin(users, eq(users.id, householdMembers.userId)).where(eq(householdMembers.householdId, me.householdId)).orderBy(asc(householdMembers.joinedAt)),
      db.select().from(paymentMethods).where(eq(paymentMethods.householdId, me.householdId)).orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.createdAt)),
      db.select().from(categories).where(eq(categories.householdId, me.householdId)).orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
    ]);
    return {
      household: { id: household!.id, name: household!.name },
      me: { memberId: me.id, role: me.role },
      members,
      paymentMethods: methods.map(({ householdId: _, archivedAt, createdAt: __, ...m }) => ({ ...m, archived: !!archivedAt })),
      categories: cats.map((c) => ({ id: c.id, kind: c.kind, parentId: c.parentId, name: c.name, sortOrder: c.sortOrder, archived: !!c.archivedAt })),
    };
  });

  app.patch("/api/household", async (req) => {
    const me = await requireMember(db, req);
    requireOwner(me);
    const { name } = parse(householdInputSchema, req.body);
    await db.update(households).set({ name }).where(eq(households.id, me.householdId));
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>("/api/members/:id", async (req) => {
    const me = await requireMember(db, req);
    if (me.id !== req.params.id) requireOwner(me);
    const patch = parse(memberUpdateSchema, req.body);
    await db.update(householdMembers).set(patch).where(and(eq(householdMembers.id, req.params.id), eq(householdMembers.householdId, me.householdId)));
    return { ok: true };
  });

  /** 대표자는 구성원을 내보내고, 구성원은 스스로 나간다. 작성한 기록은 가계에 남는다. */
  app.delete<{ Params: { id: string } }>("/api/members/:id", async (req) => {
    const me = await requireMember(db, req);
    if (me.id !== req.params.id) requireOwner(me);
    const [target] = await db.select().from(householdMembers).where(and(eq(householdMembers.id, req.params.id), eq(householdMembers.householdId, me.householdId)));
    if (!target) throw new HttpError(404, "구성원을 찾을 수 없습니다.");
    if (target.role === "owner") throw new HttpError(400, "대표자는 가계를 떠날 수 없습니다.");
    const [used] = await db.select({ n: count() }).from(transactions).where(eq(transactions.memberId, target.id));
    // 작성자 정보를 보존하기 위해 기록이 있는 구성원은 내보내지 않는다.
    if (used!.n > 0) throw new HttpError(409, "기록이 있는 구성원은 내보낼 수 없습니다.");
    await db.delete(householdMembers).where(eq(householdMembers.id, target.id));
    return { ok: true };
  });

  app.get("/api/invites", async (req) => {
    const me = await requireMember(db, req);
    requireOwner(me);
    const rows = await db
      .select({ id: invites.id, code: invites.code, expiresAt: invites.expiresAt })
      .from(invites)
      .where(and(eq(invites.householdId, me.householdId), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
      .orderBy(asc(invites.createdAt));
    return rows.map((r) => ({ ...r, url: `${config.publicUrl}/join?code=${r.code}` }));
  });

  app.post("/api/invites", async (req) => {
    const me = await requireMember(db, req);
    requireOwner(me);
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
    const [row] = await db.insert(invites).values({ householdId: me.householdId, code: newCode(), createdBy: me.id, expiresAt }).returning();
    return { id: row!.id, code: row!.code, expiresAt: row!.expiresAt, url: `${config.publicUrl}/join?code=${row!.code}` };
  });

  app.delete<{ Params: { id: string } }>("/api/invites/:id", async (req) => {
    const me = await requireMember(db, req);
    requireOwner(me);
    await db.update(invites).set({ revokedAt: new Date() }).where(and(eq(invites.id, req.params.id), eq(invites.householdId, me.householdId)));
    return { ok: true };
  });

  async function findInvite(code: string) {
    const [row] = await db
      .select({ householdId: invites.householdId, householdName: households.name })
      .from(invites)
      .innerJoin(households, eq(households.id, invites.householdId))
      .where(and(eq(invites.code, code.toUpperCase()), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())));
    if (!row) throw new HttpError(404, "유효하지 않거나 만료된 초대입니다. 대표자에게 새 초대를 요청해 주세요.");
    return row;
  }

  app.get<{ Params: { code: string } }>("/api/invites/:code/preview", async (req) => {
    const invite = await findInvite(req.params.code);
    return { householdName: invite.householdName };
  });

  app.post("/api/join", async (req) => {
    const userId = userIdOf(req);
    const { code } = parse(joinInputSchema, req.body);
    const invite = await findInvite(code);
    const [existing] = await db.select().from(householdMembers).where(eq(householdMembers.userId, userId));
    if (existing) {
      if (existing.householdId === invite.householdId) return { householdId: invite.householdId };
      throw new HttpError(409, "이미 다른 가계에 참여 중입니다.");
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const n = await memberCount(invite.householdId);
    await db.insert(householdMembers).values({
      householdId: invite.householdId,
      userId,
      role: "member",
      displayName: user!.name,
      color: MEMBER_COLORS[n % MEMBER_COLORS.length]!,
    });
    return { householdId: invite.householdId };
  });
}
