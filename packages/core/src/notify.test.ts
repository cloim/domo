import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyNotifyTemplate, groupNotificationHistory, validateNotifyPattern, type NotifyMatch, type NotifyMatchField } from "./index.ts";

interface Case {
  name: string;
  pattern: string;
  kind: "expense" | "income";
  title: string;
  text: string;
  postedAt: string;
  expected: NotifyMatch | null;
  matchField?: NotifyMatchField;
  rawText?: string;
  bigText?: string;
}

const { cases } = JSON.parse(readFileSync(new URL("../fixtures/notify-cases.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("알림 템플릿 적용(안드로이드와 같은 사례)", () => {
  it("기존 이력은 밀리초까지 같은 중복만 합치고 다른 시각과 이벤트는 보존한다", () => {
    const n = { id: 1, packageName: "kakao", title: "방", text: "같은 메시지", postedAt: 1000 };
    const result = groupNotificationHistory([n, { ...n, id: 2 }, { ...n, id: 3, postedAt: 1001 }, { ...n, id: 4, eventKey: "event-a" }, { ...n, id: 5, eventKey: "event-b" }]);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ id: 1, duplicateCount: 2 });
  });
  for (const c of cases) {
    it(c.name, () => {
      expect(applyNotifyTemplate({ pattern: c.pattern, kind: c.kind, matchField: c.matchField }, c.title, c.text, c.postedAt, c)).toEqual(c.expected);
    });
  }
  it("패턴 검사", () => {
    expect(validateNotifyPattern("(?<amount>\d+)원")).toBeNull();
    expect(validateNotifyPattern("(\d+)원")).toContain("amount");
    expect(validateNotifyPattern("(?<amount>\d+")).toContain("정규식 오류");
  });
});
