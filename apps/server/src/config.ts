import { resolve } from "node:path";

export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  /** 웹 OAuth 클라이언트 ID. 안드로이드 앱도 이 값을 serverClientId로 쓰므로 ID 토큰 aud가 된다. */
  googleClientId: string | null;
  devLogin: boolean;
  publicUrl: string;
  webDist: string | null;
  /** AI API 키 암호화용 비밀값. 없으면 JWT_SECRET 에서 파생한다. */
  aiSecretKey: string | null;
  /** 서버가 받을 주소. 기본은 이 PC 안(127.0.0.1)만. 터널과 adb reverse 모두 이 PC 안에서 접속한다. */
  host: string;
  /** AI 주소로 사설망과 이 PC를 허용할지. 테스트의 가짜 AI 서비스용이며 운영에서는 켜지 않는다. */
  aiAllowPrivateHosts: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name} 가 필요합니다.`);
  return value;
}

export function loadConfig(): Config {
  const agentTestDb = process.env.DOMO_AGENT_TEST_DB === "true";
  const databaseUrl = new URL(required("DATABASE_URL"));
  if (agentTestDb) {
    if (!(["localhost", "127.0.0.1"].includes(databaseUrl.hostname) && databaseUrl.port === "5434")) {
      throw new Error("에이전트 실행은 localhost:5434의 테스트 DB만 사용할 수 있습니다.");
    }
    databaseUrl.pathname = "/domo_test";
  }
  return {
    port: agentTestDb ? 4320 : Number(process.env.PORT ?? 4300),
    databaseUrl: databaseUrl.toString(),
    jwtSecret: required("JWT_SECRET"),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    devLogin: agentTestDb || process.env.DEV_LOGIN === "true",
    publicUrl: agentTestDb ? "http://localhost:4320" : process.env.PUBLIC_URL ?? "http://localhost:4300",
    webDist: agentTestDb ? null : process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null,
    aiSecretKey: process.env.AI_SECRET_KEY || null,
    host: agentTestDb ? "127.0.0.1" : process.env.HOST || "127.0.0.1",
    aiAllowPrivateHosts: process.env.AI_ALLOW_PRIVATE_HOSTS === "true",
  };
}
