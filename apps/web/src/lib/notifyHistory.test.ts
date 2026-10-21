import { describe, expect, it } from "vitest";
import type { NotifyTemplate } from "@domo/core";
import { matchNotificationHistory } from "./notifyHistory.ts";

const notification = { id: 1, packageName: "bank.app", title: "승인", text: "생략된 본문", bigText: "가게 12,300원", postedAt: 0, matchedTemplateId: "old" };
const template: NotifyTemplate = { id: "new", name: "카드", packageName: "bank.app", kind: "expense", pattern: "(?<counterparty>가게) (?<amount>[\\d,]+)원", matchField: "body", paymentMethodId: "method", categoryId: "category", enabled: true, sampleTitle: "", sampleText: "" };

describe("알림 이력 등록 패턴 비교", () => {
  it("현재 패턴으로 원본 긴 본문을 분석하고 등록 값을 채운다", () => {
    expect(matchNotificationHistory(notification, [template], "2026-10-21T13:45")).toEqual({ kind: "expense", amount: 12300, counterparty: "가게", memo: null, occurredAt: "2026-10-21T13:45", paymentMethodId: "method", categoryId: "category", templateId: "new", sourcePackage: "bank.app" });
  });
  it("다른 앱과 비활성 패턴은 건너뛰고 첫 일치 패턴을 쓴다", () => {
    const templates = [{ ...template, packageName: "other.app" }, { ...template, enabled: false }, { ...template, id: "first" }, template];
    expect(matchNotificationHistory(notification, templates, "2026-10-21T13:45")?.templateId).toBe("first");
  });
  it("기존 매칭 기록이 있어도 현재 패턴이 불일치하면 등록하지 않는다", () => {
    expect(matchNotificationHistory(notification, [{ ...template, pattern: "불일치(?<amount>\\d+)" }], "2026-10-21T13:45")).toBeNull();
  });
});
