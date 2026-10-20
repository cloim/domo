import { CapacitorHttp } from "@capacitor/core";
import { applyNotifyTemplate, validateNotifyPattern, type TransactionKind } from "@domo/core";
import { z } from "zod";
import { DomoNotify, type AiConfig } from "./notify.ts";

/**
 * AI 서비스는 모두 OpenAI 호환 형식(/models, /chat/completions)으로 부른다.
 * 앱의 네이티브 HTTP(CapacitorHttp)로 보내 브라우저 CORS 제한을 피하고, API 키는 기기 밖으로 나가지 않는다.
 */
export const AI_PROVIDERS = [
  { id: "anthropic", label: "Claude (Anthropic)", baseUrl: "https://api.anthropic.com/v1" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "gemini", label: "Gemini (Google)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "custom", label: "기타 OpenAI 호환", baseUrl: "" },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

const trimSlash = (url: string) => url.replace(/\/+$/, "");

async function aiRequest(config: AiConfig, key: string, method: "GET" | "POST", path: string, body?: unknown) {
  if (!config.baseUrl) throw new Error("AI 서비스 주소를 입력해 주세요.");
  const res = await CapacitorHttp.request({
    url: `${trimSlash(config.baseUrl)}${path}`,
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    data: body,
    connectTimeout: 15_000,
    readTimeout: 120_000,
  });
  if (res.status === 401 || res.status === 403) throw new Error("API 키가 맞지 않거나 권한이 없습니다.");
  if (res.status >= 400) {
    const message = typeof res.data === "object" ? (res.data?.error?.message ?? JSON.stringify(res.data)) : String(res.data);
    throw new Error(`AI 서비스 오류(${res.status}): ${String(message).slice(0, 200)}`);
  }
  return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
}

async function requireKey(): Promise<string> {
  const { key } = await DomoNotify.getAiKey();
  if (!key) throw new Error("설정 > AI 설정에서 API 키를 먼저 등록해 주세요.");
  return key;
}

/** 서비스가 제공하는 모델 목록. 지원하지 않는 서비스는 빈 목록 */
export async function listModels(config: AiConfig, key?: string): Promise<string[]> {
  const data = await aiRequest(config, key ?? (await requireKey()), "GET", "/models");
  const ids = ((data?.data ?? data?.models ?? []) as { id?: string; name?: string }[]).map((m) => (m.id ?? m.name ?? "").replace(/^models\//, "")).filter(Boolean);
  return [...new Set(ids)].sort();
}

const analysisSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["expense", "income"]),
  pattern: z.string().min(1),
});

export interface TemplateSuggestion {
  name: string;
  kind: TransactionKind;
  pattern: string;
}

const SYSTEM_PROMPT = `너는 한국 금융 알림(카드 승인, 계좌 입출금, 간편결제)의 문구 템플릿을 분석해 정규식을 만든다.
입력은 알림의 제목과 본문이다. 앱은 "제목 + 줄바꿈(\\n) + 본문" 문자열에 정규식을 적용한다.

규칙:
- JavaScript와 Java 정규식에서 모두 동작하는 문법만 쓴다. 플래그 없이 동작해야 한다. 가변 길이 lookbehind는 쓰지 않는다.
- 이름 그룹을 쓴다: amount(필수, 숫자와 쉼표), counterparty(가맹점, 입금자 등 거래처), memo(선택), month, day, hour, minute(알림에 있을 때만).
- 금액, 날짜, 시각, 가맹점, 이름, 잔액처럼 알림마다 바뀌는 부분은 일반화하고, 고정 문구("승인", "입금", 카드사 이름 등)는 그대로 둔다.
- 카드번호 끝자리, 마스킹된 이름, 누적금액, 잔액은 그룹으로 잡지 않는다.
- 같은 앱의 다른 종류 알림(광고, 명세서 안내)에는 맞지 않도록 고정 문구를 충분히 포함한다.
- kind 는 돈이 나가면 expense, 들어오면 income.
- name 은 "신한카드 승인"처럼 짧은 한국어 이름.

반드시 다음 JSON 하나만 출력한다. 다른 글이나 코드 블록 표시는 쓰지 않는다.
{"name": "...", "kind": "expense" | "income", "pattern": "..."}`;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 응답에서 결과를 찾지 못했습니다.");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * 알림 한 건을 AI로 분석해 템플릿을 제안받고, 그 알림에 실제로 맞는지 확인한다.
 * 맞지 않아도 제안은 돌려주어 사용자가 직접 고칠 수 있게 하고, 문제는 problem 으로 알린다.
 */
export async function analyzeNotification(
  config: AiConfig,
  sample: { appLabel: string; title: string; text: string; postedAt: string },
): Promise<{ suggestion: TemplateSuggestion; problem: string | null }> {
  if (!config.model) throw new Error("설정 > AI 설정에서 모델을 골라 주세요.");
  const data = await aiRequest(config, await requireKey(), "POST", "/chat/completions", {
    model: config.model,
    max_tokens: 2000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `앱: ${sample.appLabel}\n제목: ${sample.title}\n본문: ${sample.text}` },
    ],
  });
  const content: unknown = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("") : String(content ?? "");
  const parsed = analysisSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new Error("AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");

  const invalid = validateNotifyPattern(parsed.data.pattern);
  const problem = invalid
    ? `AI가 만든 정규식을 쓸 수 없습니다. ${invalid}`
    : applyNotifyTemplate(parsed.data, sample.title, sample.text, sample.postedAt)
      ? null
      : "AI가 만든 정규식이 이 알림에 맞지 않습니다. 다시 분석하거나 직접 고쳐 주세요.";
  return { suggestion: parsed.data, problem };
}
