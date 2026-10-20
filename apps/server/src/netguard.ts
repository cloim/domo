import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./http.ts";

/** 사설망, 루프백, 링크 로컬, 미지정 주소면 true */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number) as [number, number];
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // 멀티캐스트, 예약
    );
  }
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v); // fc00::/7, fe80::/10
}

/**
 * 서버가 사용자가 넣은 주소로 요청을 보내기 전에 부른다.
 * https 이고, 그 이름이 가리키는 모든 IP가 공인 주소일 때만 통과시켜 이 PC의 내부 서비스나 사설망에 닿지 못하게 한다.
 */
export async function assertPublicHttps(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "AI 서비스 주소 형식을 확인해 주세요.");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "AI 서비스 주소는 https:// 로 시작해야 합니다.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new HttpError(400, "AI 서비스 주소를 찾을 수 없습니다.");
  if (addresses.some(isPrivateAddress)) throw new HttpError(400, "내부망이나 이 PC를 가리키는 주소는 쓸 수 없습니다.");
}
