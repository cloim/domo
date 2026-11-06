import { describe, expect, it } from "vitest";
import { generateId } from "./id.ts";

describe("generateId", () => {
  it("유효한 UUID v4 형식을 반환한다", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("연속 생성 시 서로 다른 ID를 반환한다", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });

  it("crypto.randomUUID가 generateId로 폴리필되어 있어도 무한 재귀 없이 작동한다", () => {
    const original = crypto.randomUUID;
    try {
      // @ts-expect-error simulate polyfill recursion
      crypto.randomUUID = generateId;
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally {
      (crypto as unknown as { randomUUID: typeof original }).randomUUID = original;
    }
  });
});
