import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { createDb, runMigrations } from "./db/client.ts";

const { db, close } = createDb(process.env.TEST_DATABASE_URL ?? "postgres://domo:domo@localhost:5434/domo_test");
let app: FastifyInstance;

async function login(email: string, name: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/dev", payload: { email, name } });
  const { token } = res.json();
  return (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
}

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

    const card = (await owner("POST", "/api/payment-methods", { type: "card", name: "신한카드" })).json();
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

    expect((await owner("DELETE", `/api/categories/${parent.id}`)).json()).toEqual({ archived: true });
    const after = (await owner("GET", "/api/household")).json();
    expect(after.categories.find((c: { id: string }) => c.id === child.id).archived).toBe(true);

    const unused = (await owner("POST", "/api/payment-methods", { type: "card", name: "임시카드" })).json();
    expect((await owner("DELETE", `/api/payment-methods/${unused.id}`)).json()).toEqual({ archived: false });
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
