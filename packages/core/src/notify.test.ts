import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyNotifyTemplate, validateNotifyPattern, type NotifyMatch } from "./index.ts";

interface Case {
  name: string;
  pattern: string;
  kind: "expense" | "income";
  title: string;
  text: string;
  postedAt: string;
  expected: NotifyMatch | null;
}

const { cases } = JSON.parse(readFileSync(new URL("../fixtures/notify-cases.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("알림 템플릿 적용(안드로이드와 같은 사례)", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(applyNotifyTemplate({ pattern: c.pattern, kind: c.kind }, c.title, c.text, c.postedAt)).toEqual(c.expected);
    });
  }
  it("패턴 검사", () => {
    expect(validateNotifyPattern("(?<amount>\d+)원")).toBeNull();
    expect(validateNotifyPattern("(\d+)원")).toContain("amount");
    expect(validateNotifyPattern("(?<amount>\d+")).toContain("정규식 오류");
  });
});
