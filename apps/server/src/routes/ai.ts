import {
  aiAnalyzeSchema,
  aiConfigSchema,
  aiFormatOf,
  aiRequestSchema,
  aiSettingsInputSchema,
  applyNotifyTemplate,
  NOTIFY_ANALYSIS_PROMPT,
  notifyAnalysisSchema,
  validateNotifyPattern,
  type AiConfig,
} from "@domo/core";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.ts";
import type { Db } from "../db/client.ts";
import { userAiSettings } from "../db/schema.ts";
import { HttpError, parse, userIdOf } from "../http.ts";
import { assertPublicHttps } from "../netguard.ts";
import { decryptSecret, encryptSecret } from "../secret.ts";

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** 서비스가 돌려준 오류 본문에서 사람이 읽을 문구를 꺼낸다. Gemini 스트리밍은 배열로 온다. */
function errorMessage(data: unknown): string {
  const first = Array.isArray(data) ? data[0] : data;
  const err = (first as { error?: { message?: string } | string } | null)?.error;
  const message = typeof err === "string" ? err : err?.message;
  return String(message ?? (typeof data === "string" ? data : JSON.stringify(data))).slice(0, 300);
}

async function send(url: string, headers: Record<string, string>, body: unknown, allowPrivate: boolean): Promise<unknown> {
  if (!allowPrivate) await assertPublicHttps(url);
  let res: Response;
  try {
    res = await fetch(url, {
      // 다른 주소로 넘기는 응답을 따라가면 위의 주소 검사를 우회할 수 있다.
      redirect: "manual",
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new HttpError(502, `AI 서비스에 연결하지 못했습니다. 주소를 확인해 주세요. (${(err as Error).message})`);
  }
  const raw = await res.text();
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // 글로 온 오류는 그대로 보여준다.
  }
  if (res.status >= 300 && res.status < 400) throw new HttpError(502, "AI 서비스가 다른 주소로 넘기려 해서 중단했습니다. 주소를 확인해 주세요.");
  if (!res.ok) {
    const prefix = res.status === 401 || res.status === 403 ? "API 키나 권한을 확인해 주세요." : `AI 서비스 오류(${res.status}).`;
    throw new HttpError(502, `${prefix} ${errorMessage(data)}`);
  }
  return data;
}

/** 시스템 지시와 사용자 글 한 건을 보내고 모델의 답 글을 받는다. */
export async function completeText(config: AiConfig, key: string, system: string, user: string, allowPrivate = false): Promise<string> {
  if (!config.model) throw new HttpError(400, "모델을 입력하거나 골라 주세요.");
  if (aiFormatOf(config.provider) === "gemini") {
    const data = await send(
      config.baseUrl.replace("{model}", encodeURIComponent(config.model)),
      { "x-goog-api-key": key },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
      },
      allowPrivate,
    );
    // streamGenerateContent 는 조각 배열, generateContent 는 객체 하나다. 생각 조각(thought)은 뺀다.
    const chunks = (Array.isArray(data) ? data : [data]) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }[];
    return chunks
      .flatMap((c) => c.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
  }
  const data = (await send(
    `${trimSlash(config.baseUrl)}/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model: config.model,
      max_tokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    allowPrivate,
  )) as { choices?: { message?: { content?: unknown } }[] };
  const content = data?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("") : String(content ?? "");
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new HttpError(502, `AI 응답에서 결과를 찾지 못했습니다. 받은 응답: ${text.slice(0, 120) || "(비어 있음)"}`);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new HttpError(502, "AI 응답이 올바른 JSON이 아닙니다. 다시 시도해 주세요.");
  }
}

export async function aiRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }) {
  async function saved(userId: string) {
    const [row] = await db.select().from(userAiSettings).where(eq(userAiSettings.userId, userId));
    return row ?? null;
  }

  /** 요청에 담긴 설정과 키를 먼저 쓰고, 없으면 저장된 값을 쓴다. */
  async function resolve(userId: string, body: { config?: AiConfig; key?: string }) {
    const row = await saved(userId);
    const cfg = body.config ?? (row ? { provider: row.provider as AiConfig["provider"], baseUrl: row.baseUrl, model: row.model } : null);
    if (!cfg) throw new HttpError(400, "AI 서비스를 먼저 설정해 주세요.");
    const key = body.key ?? (row?.keyEnc ? decryptSecret(config, row.keyEnc) : null);
    if (!key) throw new HttpError(400, "API 키를 입력하거나 저장해 주세요.");
    return { cfg, key };
  }

  app.get("/api/ai/settings", async (req) => {
    const row = await saved(userIdOf(req));
    if (!row) return null;
    return { provider: row.provider, baseUrl: row.baseUrl, model: row.model, hasKey: !!row.keyEnc };
  });

  app.put("/api/ai/settings", async (req) => {
    const userId = userIdOf(req);
    const input = parse(aiSettingsInputSchema, req.body);
    if (!config.aiAllowPrivateHosts) await assertPublicHttps(input.baseUrl.replace("{model}", "model"));
    const keyEnc = input.key === undefined ? undefined : input.key === null ? null : encryptSecret(config, input.key);
    const values = { provider: input.provider, baseUrl: input.baseUrl, model: input.model, updatedAt: new Date(), ...(keyEnc === undefined ? {} : { keyEnc }) };
    await db
      .insert(userAiSettings)
      .values({ userId, ...values, keyEnc: keyEnc ?? null })
      .onConflictDoUpdate({ target: userAiSettings.userId, set: values });
    return { ok: true };
  });

  app.post("/api/ai/models", async (req) => {
    const body = parse(aiRequestSchema, req.body);
    const { cfg, key } = await resolve(userIdOf(req), body);
    if (aiFormatOf(cfg.provider) !== "openai") return [];
    const data = (await send(`${trimSlash(cfg.baseUrl)}/models`, { authorization: `Bearer ${key}` }, undefined, config.aiAllowPrivateHosts)) as { data?: { id?: string }[]; models?: { name?: string }[] };
    const ids = [...(data?.data ?? []).map((m) => m.id), ...(data?.models ?? []).map((m) => m.name)].map((id) => (id ?? "").replace(/^models\//, "")).filter(Boolean);
    return [...new Set(ids)].sort();
  });

  /** 알림 한 건을 분석해 템플릿을 제안하고, 그 알림에 실제로 맞는지 확인해 함께 돌려준다. */
  app.post("/api/ai/analyze-notification", async (req) => {
    const body = parse(aiAnalyzeSchema, req.body);
    const { cfg, key } = await resolve(userIdOf(req), body);
    const started = Date.now();
    const { sample } = body;
    const text = await completeText(
      aiConfigSchema.parse(cfg),
      key,
      NOTIFY_ANALYSIS_PROMPT,
      `앱: ${sample.appLabel}\n제목: ${sample.title}\n본문: ${sample.text}`,
      config.aiAllowPrivateHosts,
    );
    const parsed = notifyAnalysisSchema.safeParse(extractJson(text));
    if (!parsed.success) throw new HttpError(502, "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");
    const invalid = validateNotifyPattern(parsed.data.pattern);
    const match = invalid ? null : applyNotifyTemplate(parsed.data, sample.title, sample.text, sample.postedAt);
    const problem = invalid ? `AI가 만든 정규식을 쓸 수 없습니다. ${invalid}` : match ? null : "AI가 만든 정규식이 이 알림에 맞지 않습니다. 다시 분석하거나 직접 고쳐 주세요.";
    return { suggestion: parsed.data, match, problem, elapsedMs: Date.now() - started };
  });
}
