import type { FastifyInstance } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { SignJWT } from "jose";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { HttpError, parse } from "../http.ts";

const SESSION_DAYS = 90;

export function sessionKey(config: Config) {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function authRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }) {
  const google = new OAuth2Client();

  async function upsertUser(profile: { sub: string; email: string; name: string; avatarUrl: string | null }) {
    const [user] = await db
      .insert(users)
      .values({ googleSub: profile.sub, email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl })
      .onConflictDoUpdate({ target: users.googleSub, set: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl } })
      .returning();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user!.id)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DAYS}d`)
      .sign(sessionKey(config));
    return { token };
  }

  app.get("/api/auth/config", async () => ({ googleClientId: config.googleClientId, devLogin: config.devLogin }));

  app.post("/api/auth/google", async (req) => {
    if (!config.googleClientId) throw new HttpError(503, "구글 로그인이 아직 설정되지 않았습니다.");
    const { idToken } = parse(z.object({ idToken: z.string().min(10) }), req.body);
    const ticket = await google.verifyIdToken({ idToken, audience: config.googleClientId }).catch(() => {
      throw new HttpError(401, "구글 인증을 확인하지 못했습니다. 다시 로그인해 주세요.");
    });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) throw new HttpError(401, "확인된 구글 계정이 필요합니다.");
    return upsertUser({ sub: p.sub, email: p.email, name: p.name ?? p.email.split("@")[0]!, avatarUrl: p.picture ?? null });
  });

  // 구글 OAuth 클라이언트 등록 전 로컬 개발용. DEV_LOGIN=true 일 때만 열린다.
  if (config.devLogin) {
    app.post("/api/auth/dev", async (req) => {
      const { email, name } = parse(z.object({ email: z.string().email(), name: z.string().min(1) }), req.body);
      return upsertUser({ sub: `dev:${email}`, email, name, avatarUrl: null });
    });
  }
}
