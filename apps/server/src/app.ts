import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { jwtVerify } from "jose";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import { HttpError } from "./http.ts";
import { aiRoutes } from "./routes/ai.ts";
import { authRoutes, sessionKey } from "./routes/auth.ts";
import { householdRoutes } from "./routes/household.ts";
import { ledgerRoutes } from "./routes/ledger.ts";
import { notifyRoutes } from "./routes/notify.ts";
import { recurringRoutes } from "./routes/recurring.ts";

const PUBLIC_API = new Set(["/api/health", "/api/auth/config", "/api/auth/google", "/api/auth/dev"]);

export async function buildApp({ db, config }: { db: Db; config: Config }) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" ? { level: "info" } : false });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof HttpError) return reply.status(error.status).send({ message: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ message: "요청을 처리할 수 없습니다." });
    app.log.error(error);
    return reply.status(500).send({ message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
  });

  // 안드로이드 앱(WebView, https://localhost)에서 호출하므로 Bearer 토큰과 CORS를 함께 쓴다.
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "origin");
      reply.header("access-control-allow-headers", "authorization, content-type");
      reply.header("access-control-allow-methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return reply.status(204).send();
    const path = req.url.split("?")[0]!;
    if (!path.startsWith("/api/") || PUBLIC_API.has(path)) return;
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) throw new HttpError(401, "로그인이 필요합니다.");
    try {
      const { payload } = await jwtVerify(token, sessionKey(config));
      req.userId = payload.sub;
    } catch {
      throw new HttpError(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
    }
  });

  app.get("/api/health", async () => ({ ok: true }));
  await app.register(authRoutes, { db, config });
  await app.register(householdRoutes, { db, config });
  await app.register(ledgerRoutes, { db });
  await app.register(recurringRoutes, { db });
  await app.register(aiRoutes, { db, config });
  await app.register(notifyRoutes, { db, config });

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist });
    // 클라이언트 라우팅: API가 아닌 경로는 index.html로 돌려준다.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.status(404).send({ message: "존재하지 않는 API입니다." });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
