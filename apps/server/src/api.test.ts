import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { createDb, runMigrations } from "./db/client.ts";
import { generateRecurring } from "./routes/recurring.ts";
import { nowLocalDateTime } from "@domo/core";

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
    config: { port: 0, databaseUrl: "", jwtSecret: "test-secret", googleClientId: null, devLogin: true, publicUrl: "https://domo.test", webDist: null, aiSecretKey: null, host: "127.0.0.1", aiAllowPrivateHosts: true },
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

    // 같은 거래처의 최근 기록으로 분류와 지출수단을 추천한다.
    expect((await member("GET", `/api/transactions/suggest?counterparty=${encodeURIComponent("이마트")}&kind=expense`)).json()).toEqual({ categoryId: grocery.id, paymentMethodId: card.id });
    expect((await member("GET", `/api/transactions/suggest?counterparty=${encodeURIComponent("없는곳")}&kind=expense`)).json()).toEqual({ categoryId: null, paymentMethodId: null });

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

describe("카드 월 목표", () => {
  it("승인월 전액, 제외 지출처, 목표 경계와 가계 권한을 적용한다", async () => {
    const owner = await login("target@test.com", "목표 사용자");
    const other = await login("target-other@test.com", "다른 가계");
    await owner("POST", "/api/households", { name: "목표 검증 가계" });
    await other("POST", "/api/households", { name: "다른 목표 가계" });
    const base = (await owner("GET", "/api/household")).json();
    const category = base.categories.find((c: { parentId: string | null; kind: string }) => c.parentId && c.kind === "expense");
    const method = (await owner("POST", "/api/payment-methods", cardInput({ monthlyTargetAmount: 100000, targetExcludedCounterparties: ["보험사"] }))).json();
    const saved = (await owner("GET", "/api/household")).json().paymentMethods.find((m: { id: string }) => m.id === method.id);
    expect(saved).toMatchObject({ monthlyTargetAmount: 100000, targetExcludedCounterparties: ["보험사"] });
    const tx = { kind: "expense", paymentMethodId: method.id, counterparty: "마트", memo: null, amount: 90000, installmentMonths: 3, categoryId: category.id, occurredAt: "2026-01-31T23:59" };
    expect((await owner("POST", "/api/transactions", tx)).statusCode).toBe(200);
    await owner("POST", "/api/transactions", { ...tx, counterparty: "보험사", amount: 200000, installmentMonths: 1 });
    const check = (amount: number, occurredAt = "2026-01-31T23:59", counterparty = "편의점") => owner("POST", `/api/payment-methods/${method.id}/target-status`, { amount, occurredAt, counterparty });
    expect((await check(9999)).json()).toMatchObject({ spent: 99999, message: null });
    expect((await check(10000)).json()).toMatchObject({ target: 100000, spent: 100000, message: expect.stringContaining("목표 금액을 초과") });
    expect((await check(10001)).json().spent).toBe(100001);
    expect((await check(10000, "2026-02-01T00:00")).json()).toMatchObject({ spent: 10000, message: null });
    expect((await check(200000, undefined, "보험사")).json()).toEqual({ message: null });
    expect((await check(10000, undefined, "보험사 지점")).json().message).toContain("목표 금액을 초과");
    expect((await other("POST", `/api/payment-methods/${method.id}/target-status`, { amount: 10000, occurredAt: tx.occurredAt, counterparty: "마트" })).statusCode).toBe(404);
    for (const monthlyTargetAmount of [0, -1, 1.5, 10000000001]) {
      expect((await owner("PUT", `/api/payment-methods/${method.id}`, cardInput({ monthlyTargetAmount }))).statusCode).toBe(400);
    }
    // 구버전 클라이언트가 새 설정을 생략해도 기존 값을 보존한다.
    await owner("PUT", `/api/payment-methods/${method.id}`, cardInput());
    expect((await check(10000)).json().message).toContain("목표 금액을 초과");
    await owner("PUT", `/api/payment-methods/${method.id}`, cardInput({ monthlyTargetAmount: null, targetExcludedCounterparties: [] }));
    expect((await check(200000)).json()).toEqual({ message: null });
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

    // 금액을 바꾸면 이력에 남고, 바꾸지 않은 수정은 남기지 않는다.
    await owner("PUT", `/api/recurring/${id}`, { ...input, active: true, endMonth: item.startMonth, amount: 52000 });
    await owner("PUT", `/api/recurring/${id}`, { ...input, active: true, endMonth: item.startMonth, amount: 52000, memo: "실손" });
    const history = (await owner("GET", `/api/recurring/${id}/history`)).json();
    expect(history.changes.map((c: { oldAmount: number | null; newAmount: number }) => [c.oldAmount, c.newAmount])).toEqual([
      [null, 50000],
      [50000, 52000],
    ]);
    expect(history.records).toHaveLength(1);
    expect(history.records[0].amount).toBe(50000);
    expect((await owner("POST", "/api/recurring", { ...input, categoryId: base.categories.find((c: { parentId: string | null }) => !c.parentId).id })).statusCode).toBe(400);
  });
});

describe("AI 설정과 알림 분석", () => {
  it("키는 암호화해 저장하고 돌려주지 않으며, 두 형식 모두 서버가 대신 호출한다", async () => {
    // 가짜 AI 서비스: OpenAI 호환과 Gemini 스트리밍 응답을 흉내 낸다.
    const seen: { path: string; auth?: string; goog?: string }[] = [];
    const pattern = String.raw`(?<amount>[\d,]+)원\(\S+\)(?<month>\d{2})/(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}) (?<counterparty>\S+)`;
    const answer = JSON.stringify({ name: "신한카드 승인", kind: "expense", pattern });
    const mock = Fastify();
    mock.get("/v1/models", async (req) => (seen.push({ path: req.url, auth: req.headers.authorization }), { data: [{ id: "model-b" }, { id: "model-a" }] }));
    // 모델이 JSON 앞에 설명을 붙여도 JSON 만 골라낸다.
    mock.post("/v1/chat/completions", async (req) => (seen.push({ path: req.url, auth: req.headers.authorization }), { choices: [{ message: { content: `결과입니다\n${answer}` } }] }));
    mock.post("/g/models/:model", async (req) => {
      seen.push({ path: req.url, goog: req.headers["x-goog-api-key"] as string });
      return [{ candidates: [{ content: { parts: [{ text: "생각", thought: true }, { text: answer.slice(0, 20) }] } }] }, { candidates: [{ content: { parts: [{ text: answer.slice(20) }] } }] }];
    });
    await mock.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(mock.server.address() as { port: number }).port}`;

    const user = await login("ai@test.com", "에이아이");
    const openai = { provider: "custom", baseUrl: `${base}/v1`, model: "model-a" };
    expect((await user("PUT", "/api/ai/settings", { ...openai, key: "sk-secret" })).statusCode).toBe(200);
    expect((await user("GET", "/api/ai/settings")).json()).toEqual({ ...openai, hasKey: true });
    const [stored] = await db.execute(sql`SELECT key_enc FROM user_ai_settings`);
    expect(String((stored as { key_enc: string }).key_enc)).not.toContain("sk-secret");

    expect((await user("POST", "/api/ai/models", {})).json()).toEqual(["model-a", "model-b"]);
    const sample = { appLabel: "신한카드", title: "신한카드", text: "신한카드(1234)승인 김*모 12,500원(일시불)10/20 13:45 스타벅스 누적1,234,000원", postedAt: "2026-10-20T13:46" };
    const r1 = (await user("POST", "/api/ai/analyze-notification", { sample })).json();
    expect(r1).toMatchObject({ problem: null, match: { amount: 12500, counterparty: "스타벅스", occurredAt: "2026-10-20T13:45" } });
    expect(seen.at(-1)).toMatchObject({ path: "/v1/chat/completions", auth: "Bearer sk-secret" });

    // 저장하지 않은 Gemini 설정과 키로 바로 시험한다.
    const gemini = { provider: "gemini", baseUrl: `${base}/g/models/{model}:streamGenerateContent`, model: "gemini-3.6-flash" };
    const r2 = (await user("POST", "/api/ai/analyze-notification", { sample, config: gemini, key: "g-key" })).json();
    expect(r2).toMatchObject({ problem: null, match: { amount: 12500 } });
    expect(seen.at(-1)).toMatchObject({ path: "/g/models/gemini-3.6-flash:streamGenerateContent", goog: "g-key" });

    // 키를 지우고, 서비스 오류는 문구를 담아 돌려준다.
    await user("PUT", "/api/ai/settings", { ...openai, key: null });
    expect((await user("GET", "/api/ai/settings")).json().hasKey).toBe(false);
    expect((await user("POST", "/api/ai/models", {})).statusCode).toBe(400);
    await mock.close();
  });
});

describe("알림 연동 기기 동기화", () => {
  it("대기 건을 보존하고 본인만 처리하며 동시 등록과 재전송에도 거래를 하나만 만든다", async () => {
    const me = await login("pending@test.com", "대기 테스트");
    const other = await login("pending-other@test.com", "다른 계정");
    await me("POST", "/api/households", { name: "대기함 테스트" });
    const household = (await me("GET", "/api/household")).json();
    const category = household.categories.find((c: { parentId: string | null; kind: string }) => c.parentId && c.kind === "expense");
    const deviceId = crypto.randomUUID();
    await me("PUT", `/api/notify/devices/${deviceId}`, { name: "테스트 휴대폰" });
    const prefill = { kind: "expense", amount: 12000, counterparty: "대기 거래처", memo: null,
      occurredAt: "2026-10-20T12:30", paymentMethodId: household.paymentMethods[0].id, categoryId: category.id };
    const items = ["a", "b", "c"].map((key) => ({ eventKey: key.repeat(64), packageName: "test.bank", postedAt: Date.now() - 40 * 86_400_000, prefill }));
    const upload = () => me("POST", `/api/notify/devices/${deviceId}/registrations`, { items });
    expect((await upload()).statusCode).toBe(200);
    expect((await other("POST", `/api/notify/devices/${deviceId}/registrations`, { items })).statusCode).toBe(404);
    const pending = (await me("GET", "/api/notify/registrations")).json();
    expect(pending).toHaveLength(3);
    expect((await other("GET", "/api/notify/registrations")).json()).toHaveLength(0);
    expect((await other("POST", "/api/notify/registrations/exclude", { id: pending[0].id })).statusCode).toBe(404);
    const input = { ...prefill, installmentMonths: 1, pendingId: pending[0].id };
    const invalid = await me("POST", "/api/transactions", { ...input, categoryId: crypto.randomUUID() });
    expect(invalid.statusCode).toBe(400);
    expect((await me("GET", "/api/notify/registrations")).json()).toHaveLength(3);
    const saved = await Promise.all([me("POST", "/api/transactions", input), me("POST", "/api/transactions", input)]);
    expect(saved.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(saved[0]!.json().id).toBe(saved[1]!.json().id);
    expect((await me("POST", "/api/notify/registrations/exclude", { id: pending[0].id })).statusCode).toBe(409);
    expect((await me("POST", "/api/notify/registrations/exclude", { id: pending[1].id })).statusCode).toBe(200);
    expect((await me("POST", "/api/transactions", { ...input, pendingId: pending[1].id })).statusCode).toBe(409);
    await upload();
    const remaining = (await me("GET", "/api/notify/registrations")).json();
    expect(remaining.map((r: { id: string }) => r.id)).toEqual([pending[2].id]);
    const raw = await db.execute(sql`SELECT prefill_enc FROM notify_registrations WHERE device_id = ${deviceId}`);
    expect(JSON.stringify(raw)).not.toContain("대기 거래처");
  });
  it("기기 등록, 설정 사본 버전, 알림 업로드(중복 없음, 암호화), 다른 계정 차단", async () => {
    const me = await login("dad@test.com", "아빠");
    const other = await login("other@test.com", "남");
    const deviceId = "0b7c6a52-6d0a-4f3e-9a51-2a3b4c5d6e7f";

    expect((await me("PUT", `/api/notify/devices/${deviceId}`, { name: "Pixel 9" })).json()).toEqual({ configVersion: 0 });
    expect((await other("PUT", `/api/notify/devices/${deviceId}`, { name: "가로채기" })).statusCode).toBe(409);
    expect((await other("GET", `/api/notify/devices/${deviceId}/config`)).statusCode).toBe(404);

    const config = {
      targets: [{ packageName: "com.shinhan.card", label: "신한카드", enabled: true, removeOriginal: false }],
      templates: [
        { id: "t1", name: "신한카드 승인", packageName: "com.shinhan.card", kind: "expense", pattern: "(?<amount>[\\d,]+)원", paymentMethodId: null, categoryId: null, enabled: true, sampleTitle: "", sampleText: "" },
      ],
    };
    expect((await me("PUT", `/api/notify/devices/${deviceId}/config`, config)).json()).toEqual({ version: 1 });
    expect((await me("GET", `/api/notify/devices/${deviceId}/config`)).json()).toEqual({ ...config, version: 1 });

    const now = Date.now();
    const items = [
      { localId: 1, packageName: "com.shinhan.card", title: "신한카드", text: "승인 12,500원 스타벅스", postedAt: now - 60_000, matchedTemplateId: "t1" },
      { localId: 2, packageName: "com.shinhan.card", title: "신한카드", text: "명세서 안내", postedAt: now, matchedTemplateId: null },
      { localId: 3, packageName: "com.shinhan.card", title: "오래된", text: "31일 전", postedAt: now - 31 * 86_400_000, matchedTemplateId: null },
    ];
    // 같은 알림을 다시 올려도(재전송) 한 번만 저장하고, 응답의 버전으로 PC 변경을 알아챈다.
    expect((await me("POST", `/api/notify/devices/${deviceId}/notifications`, { items })).json()).toEqual({ accepted: 3, configVersion: 1 });
    await me("POST", `/api/notify/devices/${deviceId}/notifications`, { items: items.slice(0, 2) });
    const list = (await me("GET", `/api/notify/devices/${deviceId}/notifications?packageName=com.shinhan.card`)).json();
    expect(list.map((n: { id: number; text: string }) => [n.id, n.text])).toEqual([
      [2, "명세서 안내"],
      [1, "승인 12,500원 스타벅스"],
    ]);
    const raw = await db.execute(sql`SELECT text_enc FROM notify_notifications`);
    expect(JSON.stringify(raw)).not.toContain("스타벅스");

    await me("PUT", `/api/notify/devices/${deviceId}/apps`, { apps: [{ packageName: "com.shinhan.card", label: "신한카드", launchable: true }] });
    expect((await me("GET", `/api/notify/devices/${deviceId}/apps`)).json()).toHaveLength(1);
    expect((await me("GET", "/api/notify/devices")).json()[0]).toMatchObject({ id: deviceId, name: "Pixel 9", targetCount: 1, templateCount: 1, configVersion: 1 });
  });
});

describe("알림 원본 필드와 이벤트 갱신", () => {
  it("원본을 암호화하고 재게시와 역순 재전송은 합치며 별도 메시지는 유지한다", async () => {
    const me = await login("notify-fields@test.com", "알림 테스트");
    const deviceId = "3b7c6a52-6d0a-4f3e-9a51-2a3b4c5d6e7f";
    await me("PUT", `/api/notify/devices/${deviceId}`, { name: "알림 기기" });
    const event = { localId: 1, packageName: "com.kakao.talk", title: "카드알림", text: "승인 1,000원", rawText: "승인", bigText: "승인 1,000원", postedAt: Date.now(), eventAt: Date.now(), notificationKey: "알림키", eventKey: "a".repeat(64), revision: 1, matchedTemplateId: null };
    const upload = (items: object[]) => me("POST", `/api/notify/devices/${deviceId}/notifications`, { items });
    expect((await upload([event, { ...event, localId: 2 }])).statusCode).toBe(200);
    let list = (await me("GET", `/api/notify/devices/${deviceId}/notifications`)).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ rawText: "승인", bigText: "승인 1,000원", notificationKey: "알림키" });
    await upload([{ ...event, revision: 2, text: "승인 2,000원", bigText: "승인 2,000원" }]);
    await upload([event]);
    list = (await me("GET", `/api/notify/devices/${deviceId}/notifications`)).json();
    expect(list[0].text).toBe("승인 2,000원");
    await upload([{ ...event, localId: 3, eventKey: "b".repeat(64), postedAt: event.postedAt + 1 }]);
    expect((await me("GET", `/api/notify/devices/${deviceId}/notifications`)).json()).toHaveLength(2);
    expect((await upload([{ ...event, eventKey: "invalid" }])).statusCode).toBe(400);
    const encrypted = await db.execute(sql`SELECT title_enc, text_enc, fields_enc FROM notify_notifications WHERE device_id = ${deviceId}`);
    expect(JSON.stringify(encrypted)).not.toContain("알림키");
    expect(JSON.stringify(encrypted)).not.toContain("승인");
  });
});

describe("카드 정산", () => {
  it("서버 재계산, 할부, 가계 격리, 동시 중복과 수동 납부를 처리한다", async () => {
    const owner = await login("settle@test.com", "정산");
    await owner("POST", "/api/households", { name: "정산 가계" });
    const h = (await owner("GET", "/api/household")).json();
    const category = h.categories.find((c: { parentId: string | null }) => c.parentId);
    const cardId = (await owner("POST", "/api/payment-methods", cardInput())).json().id;
    const checkId = (await owner("POST", "/api/payment-methods", cardInput({ cardKind: "check", last4: "5678" }))).json().id;
    const input = { kind: "expense", paymentMethodId: cardId, counterparty: "마트", memo: null, amount: 9000, installmentMonths: 3, categoryId: category.id, occurredAt: "2026-08-20T10:00" };
    expect((await owner("POST", "/api/transactions", input)).statusCode).toBe(200);
    await owner("POST", "/api/transactions", { ...input, amount: 2000, installmentMonths: 1, occurredAt: "2026-09-30T23:59" });
    await owner("POST", "/api/transactions", { ...input, paymentMethodId: checkId, installmentMonths: 1, amount: 1000 });
    const preview = await owner("GET", "/api/settlements/cards?month=2026-10");
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toHaveLength(1);
    expect(preview.json()[0]).toMatchObject({ amount: 5000, paymentDate: "2026-10-14", recorded: false });
    const other = await login("settle-other@test.com", "다른 가계");
    await other("POST", "/api/households", { name: "다른 가계" });
    expect((await other("POST", "/api/settlements/cards", { month: "2026-10", paymentMethodIds: [cardId] })).statusCode).toBe(400);
    const requests = await Promise.all([1, 2].map(() => owner("POST", "/api/settlements/cards", { month: "2026-10", paymentMethodIds: [cardId], amount: 1 })));
    expect(requests.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(requests.map((r) => r.json().created).sort()).toEqual([0, 1]);
    const rows = (await owner("GET", "/api/transactions?start=2026-10-01&end=2026-10-31")).json();
    const bill = rows.find((t: { counterparty: string }) => t.counterparty === "신한카드 1234");
    expect(bill).toMatchObject({ amount: 5000, paymentMethodId: h.paymentMethods[0].id, occurredAt: "2026-10-14T00:00", settlementMethodId: cardId });
    expect((await owner("GET", "/api/settlements/cards?month=2026-10")).json()[0].recorded).toBe(true);
    expect((await owner("GET", "/api/settlements/cards?month=2027-02")).statusCode).toBe(200);
    const future = { ...input, installmentMonths: 1, occurredAt: "2099-09-01T10:00" };
    await owner("POST", "/api/transactions", future);
    expect((await owner("POST", "/api/settlements/cards", { month: "2099-10", paymentMethodIds: [cardId] })).statusCode).toBe(400);
    // 기존 수동 카드대금도 같은 금액과 결제일이면 정산 후보에서 기록됨으로 표시한다.
    await owner("DELETE", `/api/transactions/${bill.id}`);
    await owner("POST", "/api/transactions", { ...input, installmentMonths: 1, paymentMethodId: bill.paymentMethodId, categoryId: bill.categoryId, counterparty: bill.counterparty, amount: 5000, occurredAt: bill.occurredAt });
    expect((await owner("GET", "/api/settlements/cards?month=2026-10")).json()[0].recorded).toBe(true);
    expect((await owner("POST", "/api/settlements/cards", { month: "2026-10", paymentMethodIds: [cardId] })).json()).toEqual({ created: 0 });
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

describe("예산과 가족 소식", () => {
  it("가계 격리, 댓글 작성자 권한, 반응 갱신, 예산 중복 알림과 전체 기간 추천을 검증한다", async () => {
    const owner = await login("family-owner@test.com", "가족 대표");
    const member = await login("family-member@test.com", "가족 구성원");
    const outsider = await login("family-outsider@test.com", "다른 가계");
    await owner("POST", "/api/households", { name: "소식 테스트" });
    await outsider("POST", "/api/households", { name: "별도 가계" });
    const invite = (await owner("POST", "/api/invites")).json();
    await member("POST", "/api/join", { code: invite.code });
    const base = (await owner("GET", "/api/household")).json();
    const parent = base.categories.find((c: { name: string; parentId: string | null }) => c.name === "식비" && !c.parentId);
    const child = base.categories.find((c: { parentId: string }) => c.parentId === parent.id);
    const month = nowLocalDateTime().slice(0, 7);
    const input = { kind: "expense", paymentMethodId: base.paymentMethods[0].id, counterparty: "추천 마트", memo: "가족 장보기", amount: 80000, installmentMonths: 1, categoryId: child.id, occurredAt: `${month}-01T10:00` };
    const created = (await owner("POST", "/api/transactions", input)).json();
    expect((await member("PUT", "/api/budgets", { month, categoryId: parent.id, amount: 100000 })).statusCode).toBe(200);
    expect((await outsider("PUT", "/api/budgets", { month, categoryId: parent.id, amount: 100000 })).statusCode).toBe(400);
    expect((await member("PUT", "/api/budgets", { month, categoryId: child.id, amount: 100000 })).statusCode).toBe(400);
    await owner("POST", "/api/budgets/check"); await member("POST", "/api/budgets/check");
    let feed = (await member("GET", "/api/family")).json();
    expect(feed.alerts).toHaveLength(1); expect(feed.alerts[0].spent).toBe(80000);
    expect((await outsider("GET", "/api/family")).json().alerts).toHaveLength(0);
    const comment = (await member("POST", `/api/transactions/${created.id}/comments`, { body: "고마워요!" })).json();
    const ownerComment = (await owner("POST", `/api/transactions/${created.id}/comments`, { body: "확인했어요" })).json();
    expect((await member("DELETE", `/api/comments/${ownerComment.id}`)).statusCode).toBe(403);
    expect((await outsider("POST", `/api/transactions/${created.id}/comments`, { body: "다른 가계" })).statusCode).toBe(404);
    expect((await outsider("DELETE", `/api/comments/${comment.id}`)).statusCode).toBe(404);
    expect((await outsider("PUT", `/api/transactions/${created.id}/reaction`, { reaction: "like" })).statusCode).toBe(404);
    expect((await member("POST", `/api/transactions/${created.id}/comments`, { body: " " })).statusCode).toBe(400);
    await member("PUT", `/api/transactions/${created.id}/reaction`, { reaction: "like" });
    await member("PUT", `/api/transactions/${created.id}/reaction`, { reaction: "thanks" });
    feed = (await owner("GET", "/api/family")).json();
    expect(feed.comments).toHaveLength(2); expect(feed.reactions).toHaveLength(1); expect(feed.reactions[0].reaction).toBe("thanks");
    expect((await outsider("GET", "/api/transactions/all")).json()).toHaveLength(0);
    await owner("POST", "/api/transactions", { ...input, occurredAt: "2025-01-31T12:00", amount: 15000 });
    const suggestions = (await member("GET", "/api/transactions/suggestions")).json();
    expect(suggestions[0]).toMatchObject({ counterparty: "추천 마트", amount: 80000, frequency: 2, kind: "expense" });
    expect((await outsider("GET", "/api/transactions/suggestions")).json()).toHaveLength(0);
    expect((await owner("DELETE", `/api/comments/${comment.id}`)).statusCode).toBe(200);
    await owner("DELETE", `/api/transactions/${created.id}`);
    feed = (await owner("GET", "/api/family")).json();
    expect(feed.comments).toHaveLength(0); expect(feed.reactions).toHaveLength(0);
    await owner("PUT", "/api/budgets", { month, categoryId: parent.id, amount: 0 });
    expect((await owner("GET", `/api/budgets?month=${month}`)).json()).toHaveLength(0);
  });

  it("할부 마지막 날짜가 말일과 수정 이후에도 조회 범위를 지킨다", async () => {
    const owner = await login("index-owner@test.com", "할부 검증");
    await owner("POST", "/api/households", { name: "할부 검증" });
    const base = (await owner("GET", "/api/household")).json();
    const card = (await owner("POST", "/api/payment-methods", cardInput())).json();
    const child = base.categories.find((c: { kind: string; parentId: string | null }) => c.kind === "expense" && c.parentId);
    const input = { kind: "expense", paymentMethodId: card.id, counterparty: "말일 할부", memo: null, amount: 10001, installmentMonths: 2, categoryId: child.id, occurredAt: "2026-01-31T22:30" };
    const t = (await owner("POST", "/api/transactions", input)).json();
    expect((await owner("GET", "/api/transactions?start=2026-02-28&end=2026-02-28")).json().map((x: { id: string }) => x.id)).toContain(t.id);
    expect((await owner("GET", "/api/transactions?start=2026-03-01&end=2026-03-31")).json()).toHaveLength(0);
    await owner("PATCH", `/api/transactions/${t.id}`, { ...input, installmentMonths: 3 });
    expect((await owner("GET", "/api/transactions?start=2026-03-31&end=2026-03-31")).json().map((x: { id: string }) => x.id)).toContain(t.id);
  });
});
