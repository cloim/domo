// 실행: node scripts/check-notify-pending.mjs --browser-project <Playwright 설치 폴더>
// StackPad 개발 웹서버를 사용하며 API는 브라우저 안에서 대체해 실제 데이터를 바꾸지 않는다.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const browserProject = arg("--browser-project", process.cwd());
const { chromium } = createRequire(resolve(browserProject, "package.json"))("playwright");
const auditPath = resolve(process.env.USERPROFILE, ".agents/skills/balance/scripts/ui-audit.mjs");
const { auditDom } = await import(pathToFileURL(auditPath));
const spacingSource = await readFile(resolve(auditPath, "../spacing-audit.js"), "utf8");
const output = resolve("docs/reviews/261023-pending-check");
await mkdir(output, { recursive: true });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const household = { household: { id: id(1), name: "검증 가계" }, me: { memberId: id(2), role: "owner" },
  members: [{ id: id(2), userId: id(3), displayName: "검증 사용자", color: "#23696d", role: "owner", email: "ui@example.test", avatarUrl: null }],
  paymentMethods: [{ id: id(4), type: "cash", name: "현금", archived: false }],
  categories: [{ id: id(5), name: "생활", kind: "expense", parentId: null, archived: false }, { id: id(6), name: "장보기", kind: "expense", parentId: id(5), archived: false }] };
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => localStorage.setItem("domo.session", "ui-test-session"));
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    let items = [1, 2, 3].map((n) => ({ id: `${id(7)}:${String(n).repeat(64)}`, deviceId: id(7), eventKey: String(n).repeat(64), deviceName: "테스트 휴대폰", packageName: "test.bank", postedAt: Date.now() - n * 1000,
      prefill: { kind: "expense", amount: n * 1000, counterparty: `검증 거래처 ${n}`, memo: "알림에서 가져온 내용", occurredAt: "2026-10-23T12:30", paymentMethodId: id(4), categoryId: id(6) } }));
    let failSave = true;
    let saves = 0;
    const saved = [];
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      let body = [];
      let status = 200;
      if (path === "/api/me") body = { user: { id: id(3), name: "검증 사용자", email: "ui@example.test", avatarUrl: null }, member: { id: id(2), role: "owner", householdId: id(1) } };
      else if (path === "/api/household") body = household;
      else if (path === "/api/family") body = { records: [], comments: [], reactions: [], alerts: [] };
      else if (path === "/api/notify/registrations") body = items;
      else if (path === "/api/notify/registrations/exclude") { items = items.filter((i) => i.id !== req.postDataJSON().id); body = { ok: true }; }
      else if (path === "/api/transactions/suggest") body = { categoryId: id(6), paymentMethodId: id(4) };
      else if (path === "/api/transactions" && req.method() === "POST") {
        if (failSave) { status = 500; body = { message: "저장 실패 검증" }; }
        else { const input = req.postDataJSON(); assert.ok(items.some((i) => i.id === input.pendingId)); items = items.filter((i) => i.id !== input.pendingId); body = { ...input, id: id(20 + saves++), memberId: id(2) }; saved.push(body); }
      } else if (path === "/api/transactions") body = saved;
      await route.fulfill({ status, json: body });
    });
    const audit = async (scene) => {
      await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))));
      const report = await page.evaluate(auditDom);
      const spacing = await page.evaluate(spacingSource);
      results.push({ viewport, scene, ...report, spacing });
      assert.equal(report.findings.filter((f) => f.severity === "error").length, 0, JSON.stringify(report.findings));
      if (scene !== "list") {
        const footer = await page.locator(".entry-form-foot:visible").boundingBox();
        assert.ok(footer && footer.y + footer.height <= viewport.height + 2, "등록과 제외 버튼이 화면 안에 있어야 한다");
      }
      await page.screenshot({ path: resolve(output, `${viewport.width}-${scene}.png`), animations: "disabled" });
    };
    await page.goto(arg("--url", "http://127.0.0.1:5173/records"));
    await page.getByRole("button", { name: "등록 대기 알림 있음", exact: true }).waitFor();
    assert.equal(await page.locator(".notify-status .status-dot").count(), 1);
    assert.equal(await page.locator(".notify-status").innerText(), "");
    await page.getByRole("button", { name: "등록 대기 알림 있음", exact: true }).click();
    await page.getByRole("dialog", { name: "등록 대기", exact: true }).waitFor();
    assert.equal(await page.locator(".pending-notification").count(), 3);
    await audit("list");
    await page.getByRole("button", { name: /검증 거래처 1/ }).click();
    const input = page.locator("#counterparty:visible");
    await input.waitFor();
    await page.waitForFunction(() => document.querySelector("#counterparty")?.value === "검증 거래처 1");
    assert.equal(await input.inputValue(), "검증 거래처 1");
    assert.equal(await page.getByRole("dialog", { name: "대기 알림 등록", exact: true }).count(), viewport.width < 1000 ? 1 : 0);
    await audit("entry");
    await page.getByRole("button", { name: "지출 기록", exact: true }).click();
    await page.getByRole("dialog", { name: "저장하지 못했습니다", exact: true }).waitFor();
    assert.equal(items.length, 3);
    await page.getByRole("button", { name: "확인", exact: true }).click();
    assert.equal(await input.inputValue(), "검증 거래처 1");
    failSave = false;
    await page.getByRole("button", { name: "지출 기록", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#counterparty")?.value === "검증 거래처 2");
    assert.equal(saves, 1);
    assert.equal(items.length, 2);
    await page.getByRole("button", { name: "제외하기", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#counterparty")?.value === "검증 거래처 3");
    assert.equal(items.length, 1);
    await audit("next");
    await page.getByRole("button", { name: "제외하기", exact: true }).click();
    await page.getByRole("button", { name: "등록 대기 알림", exact: true }).waitFor();
    assert.equal(await page.locator(".notify-status .status-dot").count(), 0);
    assert.equal(await page.getByRole("dialog", { name: "대기 알림 등록", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "제외하기", exact: true }).count(), 0);
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(output, "audit.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ scenarios: 2, audits: results.length, result: "passed" }));
