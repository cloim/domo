export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  /** 웹 OAuth 클라이언트 ID. 안드로이드 앱도 이 값을 serverClientId로 쓰므로 ID 토큰 aud가 된다. */
  googleClientId: string | null;
  devLogin: boolean;
  publicUrl: string;
  webDist: string | null;
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
    webDist: process.env.WEB_DIST || null,
  };
}
