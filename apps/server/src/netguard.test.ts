import { describe, expect, it } from "vitest";
import { assertPublicHttps, isPrivateAddress } from "./netguard.ts";

describe("AI 주소 검사(서버 내부 접근 차단)", () => {
  it("사설망, 루프백, 링크 로컬 주소를 가려낸다", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "142.250.196.110", "172.32.0.1", "2001:4860:4860::8888"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
  it("https 공인 주소만 통과시킨다", async () => {
    await expect(assertPublicHttps("http://api.openai.com/v1")).rejects.toThrow("https");
    await expect(assertPublicHttps("https://127.0.0.1:48731/v1")).rejects.toThrow("내부망");
    await expect(assertPublicHttps("https://localhost:4300/api")).rejects.toThrow("내부망");
    await expect(assertPublicHttps("https://[::1]/v1")).rejects.toThrow("내부망");
    await expect(assertPublicHttps("https://192.168.0.1/v1")).rejects.toThrow("내부망");
    await expect(assertPublicHttps("not a url")).rejects.toThrow("형식");
  });
});
