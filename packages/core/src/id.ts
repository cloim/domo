const nativeRandomUUID = (() => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID.bind(crypto);
    }
  } catch {
    // ignore
  }
  return null;
})();

/**
 * 안전한 UUID v4 생성 함수.
 * HTTPS 및 localhost뿐만 아니라 HTTP(비보안 컨텍스트, 예: 사설 IP 접속) 환경에서도
 * crypto.randomUUID 미지원 시 crypto.getRandomValues 및 Math.random fallback으로 안전하게 생성한다.
 */
export function generateId(): string {
  if (nativeRandomUUID && crypto.randomUUID !== generateId) {
    try {
      return nativeRandomUUID();
    } catch {
      // fallback to getRandomValues
    }
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant RFC 4122
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
