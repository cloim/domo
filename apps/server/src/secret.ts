import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Config } from "./config.ts";

/**
 * 서버에 두는 민감한 값(AI API 키, 알림 본문)의 암호화(AES-256-GCM).
 * 키는 AI_SECRET_KEY, 없으면 JWT_SECRET 에서 파생한다.
 */
function cryptoKey(config: Config) {
  return createHash("sha256").update(`${config.aiSecretKey ?? config.jwtSecret}:domo-ai-key`).digest();
}

export function encryptSecret(config: Config, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(config), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(config: Config, packed: string): string {
  const [iv, tag, body] = packed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", cryptoKey(config), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(body!), decipher.final()]).toString("utf8");
}
