import { z } from "zod";

/**
 * AI 호출 형식은 두 가지다.
 * - openai: OpenAI 호환(/models, /chat/completions, Authorization: Bearer)
 * - gemini: Gemini 고유 형식(Vertex AI 등 `...:generateContent` 또는 `...:streamGenerateContent`, x-goog-api-key)
 */
export const aiFormats = ["openai", "gemini"] as const;
export type AiFormat = (typeof aiFormats)[number];

export const AI_PROVIDERS = [
  { id: "gemini", label: "Gemini (Vertex AI)", format: "gemini", baseUrl: "https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:streamGenerateContent", model: "gemini-3.6-flash" },
  { id: "anthropic", label: "Claude (Anthropic)", format: "openai", baseUrl: "https://api.anthropic.com/v1", model: "" },
  { id: "openai", label: "OpenAI", format: "openai", baseUrl: "https://api.openai.com/v1", model: "" },
  { id: "custom", label: "기타 OpenAI 호환", format: "openai", baseUrl: "", model: "" },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

export function aiFormatOf(provider: string): AiFormat {
  return AI_PROVIDERS.find((p) => p.id === provider)?.format ?? "openai";
}

/** https 만 받는다. 로컬 모델(예: Ollama)을 위해 localhost 의 http 는 허용한다. */
const endpoint = z
  .string()
  .trim()
  .min(1, "AI 서비스 주소를 입력해 주세요.")
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v.replace("{model}", "m"));
      return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
    } catch {
      return false;
    }
  }, "주소는 https:// 로 시작해야 합니다.");

export const aiConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS.map((p) => p.id) as [AiProviderId, ...AiProviderId[]]),
  baseUrl: endpoint,
  model: z.string().trim().max(100),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;

/** 저장: key 가 문자열이면 바꾸고, null 이면 지우고, 없으면 그대로 둔다. */
export const aiSettingsInputSchema = aiConfigSchema.extend({ key: z.string().trim().min(1).max(500).nullable().optional() });

export interface AiSettings extends AiConfig {
  hasKey: boolean;
}

/** 화면이 저장 전 설정과 키로 바로 시험해 볼 수 있게 둘 다 선택으로 받는다. 없으면 저장된 값을 쓴다. */
export const aiRequestSchema = z.object({
  config: aiConfigSchema.optional(),
  key: z.string().trim().min(1).max(500).optional(),
});

export const aiAnalyzeSchema = aiRequestSchema.extend({
  sample: z.object({
    appLabel: z.string().max(100),
    title: z.string().max(500),
    text: z.string().max(4000),
    postedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  }),
});

export const NOTIFY_ANALYSIS_PROMPT = `너는 한국 금융 알림(카드 승인, 계좌 입출금, 간편결제)의 문구 템플릿을 분석해 정규식을 만든다.
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

export const notifyAnalysisSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["expense", "income"]),
  pattern: z.string().min(1),
});
export type NotifyAnalysis = z.infer<typeof notifyAnalysisSchema>;

/** AI 설정 화면의 연결 테스트에 쓰는 예시 알림 */
export const AI_TEST_SAMPLE = {
  appLabel: "신한카드",
  title: "신한카드",
  text: "신한카드(1234)승인 김*모 12,500원(일시불)10/20 13:45 스타벅스 누적1,234,000원",
  postedAt: "2026-10-20T13:46",
};
