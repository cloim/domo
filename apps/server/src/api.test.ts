import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { createDb, runMigrations } from "./db/client.ts";
import { generateRecurring } from "./routes/recurring.ts";

const { db, close } = createDb(process.env.TEST_DATABASE_URL ?? "postgres://domo:domo@localhost:5434/domo_test");
let app: FastifyInstance;

async function login(email: string, name: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/dev", payload: { email, name } });
  const { token } = res.json();
  return (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

const cardInput = (over: object = {}) => ({
  type: "card",
  name: "",
  active: true,
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
  ...over,
});

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`);
  await runMigrations(db);
  app = await buildApp({
    db,
    config: { port: 0, databaseUrl: "", jwtSecret: "test-secret", googleClientId: null, devLogin: true, publicUrl: "https://domo.test", webDist: null },
  });
});

afterAll(async () => {
  await app.close();
  await close();
});

describe("가계부 API", () => {
  it("대표자 생성, 초대, 합류, 기록, 권한 흐름", async () => {
    const owner = await login("dad@test.com", "아빠");
    const member = await login("mom@test.com", "엄마");

    expect((await owner("GET", "/api/household")).statusCode).toBe(403);
    expect((await owner("POST", "/api/households", { name: "우리집" })).statusCode).toBe(200);

    const base = (await owner("GET", "/api/household")).json();
    expect(base.paymentMethods).toHaveLength(1);
    const food = base.categories.find((c: { name: string }) => c.name === "식비");
    const grocery = base.categories.find((c: { parentId: string; name: string }) => c.parentId === food.id && c.name === "장보기");

    // 구성원은 초대를 만들 수 없고, 대표자가 만든 코드로 합류한다.
    const invite = (await owner("POST", "/api/invites")).json();
    expect(invite.url).toBe(`https://domo.test/join?code=${invite.code}`);
    expect((await member("GET", `/api/invites/${invite.code}/preview`)).json()).toEqual({ householdName: "우리집" });
    expect((await member("POST", "/api/join", { code: invite.code.toLowerCase() })).statusCode).toBe(200);
    expect((await member("POST", "/api/invites")).statusCode).toBe(403);

    const card = (await owner("POST", "/api/payment-methods", cardInput())).json();
    const created = await owner("POST", "/api/transactions", {
      kind: "expense",
      paymentMethodId: card.id,
      counterparty: "이마트",
      memo: "주간 장보기",
      amount: 90000,
      installmentMonths: 3,
      categoryId: grocery.id,
      occurredAt: "2026-09-20T10:00",
    });
    expect(created.statusCode).toBe(200);
    const txId = created.json().id;

    // 할부 원거래는 이후 달 조회에도 포함된다.
    const nov = (await member("GET", "/api/transactions?start=2026-11-01&end=2026-11-30")).json();
    expect(nov.map((t: { id: string }) => t.id)).toEqual([txId]);
    expect(nov[0].occurredAt).toBe("2026-09-20T10:00");
    expect((await member("GET", "/api/transactions?start=2026-12-01&end=2026-12-31")).json()).toHaveLength(0);

    // 대분류는 기록에 쓸 수 없고, 현금 할부는 거절된다.
    const cash = base.paymentMethods[0];
    expect((await member("POST", "/api/transactions", { ...created.json(), categoryId: food.id })).statusCode).toBe(400);
    expect(
      (await member("POST", "/api/transactions", { kind: "expense", paymentMethodId: cash.id, counterparty: "시장", memo: null, amount: 5000, installmentMonths: 2, categoryId: grocery.id, occurredAt: "2026-10-01T09:00" })).statusCode,
    ).toBe(400);

    // 구성원은 대표자의 기록을 고칠 수 없다.
    expect((await member("DELETE", `/api/transactions/${txId}`)).statusCode).toBe(403);
    expect((await owner("DELETE", `/api/transactions/${txId}`)).statusCode).toBe(200);
  });

  it("쓰인 분류와 수단은 보관하고 안 쓰인 것은 지운다", async () => {
    const owner = await login("dad@test.com", "아빠");
    const base = (await owner("GET", "/api/household")).json();
    const parent = (await owner("POST", "/api/categories", { kind: "expense", parentId: null, name: "반려동물" })).json();
    const child = (await owner("POST", "/api/categories", { kind: "expense", parentId: parent.id, name: "사료" })).json();
    const cash = base.paymentMethods[0];
    await owner("POST", "/api/transactions", { kind: "expense", paymentMethodId: cash.id, counterparty: "펫샵", memo: null, amount: 30000, installmentMonths: 1, categoryId: child.id, occurredAt: "2026-10-05T12:00" });

    expect((await owner("PATCH", `/api/categories/${parent.id}`, { name: "반려동물, 식물" })).statusCode).toBe(200);
    const renamed = (await owner("GET", "/api/household")).json().categories.find((c: { id: string }) => c.id === parent.id);
    expect(renamed.name).toBe("반려동물, 식물");

    expect((await owner("DELETE", `/api/categories/${parent.id}`)).json()).toEqual({ archived: true });
    const after = (await owner("GET", "/api/household")).json();
    expect(after.categories.find((c: { id: string }) => c.id === child.id).archived).toBe(true);

    const unused = (await owner("POST", "/api/payment-methods", cardInput({ name: "임시카드" }))).json();
    expect((await owner("DELETE", `/api/payment-methods/${unused.id}`)).json()).toEqual({ archived: false });
  });
});

describe("카드 지출수단", () => {
  it("부가 정보를 저장하고 체크카드 할부를 막는다", async () => {
    const owner = await login("dad@test.com", "아빠");
    const base = (await owner("GET", "/api/household")).json();
    const grocery = base.categories.find((c: { parentId: string | null; name: string }) => c.parentId && c.name === "장보기");
    const created = (await owner("POST", "/api/payment-methods", cardInput({ cardKind: "check", last4: "9876", holderName: "아이" }))).json();
    const saved = (await owner("GET", "/api/household")).json().paymentMethods.find((m: { id: string }) => m.id === created.id);
    expect(saved).toMatchObject({ name: "신한카드 9876", cardKind: "check", paymentDay: 14, holderName: "아이", archived: false });

    const tx = { kind: "expense", paymentMethodId: created.id, counterparty: "편의점", memo: null, amount: 30000, installmentMonths: 3, categoryId: grocery.id, occurredAt: "2026-10-01T09:00" };
    expect((await owner("POST", "/api/transactions", tx)).statusCode).toBe(400);
    expect((await owner("POST", "/api/transactions", { ...tx, installmentMonths: 1 })).statusCode).toBe(200);

    // 명의자를 구성원으로 바꾸고 미사용으로 돌린다.
    const put = await owner("PUT", `/api/payment-methods/${created.id}`, cardInput({ name: "아이 카드", cardKind: "check", holderMemberId: base.me.memberId, active: false }));
    expect(put.statusCode).toBe(200);
    const after = (await owner("GET", "/api/household")).json().paymentMethods.find((m: { id: string }) => m.id === created.id);
    expect(after).toMatchObject({ name: "아이 카드", holderMemberId: base.me.memberId, holderName: null, archived: true });
    expect((await owner("PUT", `/api/payment-methods/${created.id}`, cardInput({ holderMemberId: "6f1c2b9e-1d2a-4b7a-9c3d-2a1b3c4d5e6f" }))).statusCode).toBe(400);
  });
});

describe("고정지출", () => {
  it("결제일에 기록을 만들고 중복과 지운 달 재생성을 막는다", async () => {
    const mom = await login("mom@test.com", "엄마");
    const base = (await mom("GET", "/api/household")).json();
    const sub = base.categories.find((c: { parentId: string | null; name: string }) => c.parentId && c.name === "통신비");
    const cash = base.paymentMethods.find((m: { type: string }) => m.type === "cash");
    const owner = base.members.find((m: { role: string }) => m.role === "owner");
    const input = { counterparty: "KT", memo: "인터넷", amount: 33000, paymentDay: 31, memberId: owner.id, paymentMethodId: cash.id, categoryId: sub.id, endMonth: null, active: true };

    const { id } = (await mom("POST", "/api/recurring", input)).json();
    const [item] = (await mom("GET", "/api/recurring")).json();
    expect(item).toMatchObject({ id, paymentDay: 31, active: true });
    const start = item.startMonth as string;

    // 시작월 다음 두 달의 결제일 이후로 시계를 옮겨 놓친 달을 채운다.
    const [y, m] = start.split("-").map(Number) as [number, number];
    const later = new Date(Date.UTC(y, m + 1, 28)).toISOString().slice(0, 10);
    expect(await generateRecurring(db, later)).toBeGreaterThanOrEqual(2);
    expect(await generateRecurring(db, later)).toBe(0);

    const list = (await mom("GET", `/api/transactions?start=${start}-01&end=${later}`)).json().filter((t: { recurringId: string | null }) => t.recurringId === id);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0]).toMatchObject({ counterparty: "KT", amount: 33000, memberId: owner.id, installmentMonths: 1 });
    expect(list.every((t: { occurredAt: string }) => t.occurredAt.endsWith("T00:00"))).toBe(true);

    // 기록의 작성자는 지출자(대표자)라 구성원은 지울 수 없다. 대표자가 지워도 그 달을 다시 만들지 않는다.
    expect((await mom("DELETE", `/api/transactions/${list[0].id}`)).statusCode).toBe(403);
    const ownerApi = await login("dad@test.com", "아빠");
    expect((await ownerApi("DELETE", `/api/transactions/${list[0].id}`)).statusCode).toBe(200);
    expect(await generateRecurring(db, later)).toBe(0);

    // 쓰인 지출수단은 지우지 않고 보관하고, 고정지출을 지우면 기록은 남는다.
    expect((await mom("DELETE", `/api/recurring/${id}`)).statusCode).toBe(200);
    const remain = (await mom("GET", `/api/transactions?start=${start}-01&end=${later}`)).json().filter((t: { counterparty: string }) => t.counterparty === "KT");
    expect(remain.length).toBe(list.length - 1);
    expect(remain.every((t: { recurringId: string | null }) => t.recurringId === null)).toBe(true);
  });

  it("종료월과 사용 여부를 지킨다", async () => {
    const owner = await login("dad@test.com", "아빠");
    const base = (await owner("GET", "/api/household")).json();
    const sub = base.categories.find((c: { parentId: string | null; name: string }) => c.parentId && c.name === "보험");
    const cash = base.paymentMethods.find((m: { type: string }) => m.type === "cash");
    const input = { counterparty: "보험사", memo: null, amount: 50000, paymentDay: 1, memberId: base.me.memberId, paymentMethodId: cash.id, categoryId: sub.id, endMonth: null, active: false };
    const { id } = (await owner("POST", "/api/recurring", input)).json();
    expect(await generateRecurring(db, "2099-12-31")).toBe(0);
    const [item] = (await owner("GET", "/api/recurring")).json().filter((r: { id: string }) => r.id === id);
    await owner("PUT", `/api/recurring/${id}`, { ...input, active: true, endMonth: item.startMonth });
    expect(await generateRecurring(db, "2099-12-31")).toBe(1);
    expect((await owner("POST", "/api/recurring", { ...input, categoryId: base.categories.find((c: { parentId: string | null }) => !c.parentId).id })).statusCode).toBe(400);
  });
});

describe("개발용 로그인", () => {
  it("터널을 거친 요청은 막는다", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/dev", payload: { email: "x@test.com", name: "x" }, headers: { host: "domo.example.com", "cf-connecting-ip": "1.2.3.4" } });
    expect(res.statusCode).toBe(404);
    const cfg = await app.inject({ method: "GET", url: "/api/auth/config", headers: { host: "domo.example.com" } });
    expect(cfg.json().devLogin).toBe(false);
  });
});
