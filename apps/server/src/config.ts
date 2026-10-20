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
  return {
    port: Number(process.env.PORT ?? 4300),
    databaseUrl: required("DATABASE_URL"),
    jwtSecret: required("JWT_SECRET"),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    devLogin: process.env.DEV_LOGIN === "true",
    publicUrl: process.env.PUBLIC_URL ?? "http://localhost:4300",
    webDist: process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null,
    aiSecretKey: process.env.AI_SECRET_KEY || null,
    host: process.env.HOST || "127.0.0.1",
    aiAllowPrivateHosts: process.env.AI_ALLOW_PRIVATE_HOSTS === "true",
  };
}
