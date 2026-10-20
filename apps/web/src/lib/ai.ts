import type { AiConfig, AiSettings, NotifyAnalysis, NotifyMatch } from "@domo/core";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

/** AI 호출은 서버가 대신 한다. API 키는 서버에 암호화되어 있고 화면으로 내려오지 않는다. */
export const aiKeys = { settings: ["ai-settings"] as const };

export const useAiSettings = () => useQuery({ queryKey: aiKeys.settings, queryFn: () => api<AiSettings | null>("/api/ai/settings") });

export interface AnalysisResult {
  suggestion: NotifyAnalysis;
  match: NotifyMatch | null;
  /** 정규식을 쓸 수 없거나 예시에 맞지 않을 때의 안내. 문제가 없으면 null */
  problem: string | null;
  elapsedMs: number;
}

/** 저장하지 않은 설정과 키로 시험할 때만 config, key 를 넘긴다. */
export const saveAiSettings = (input: AiConfig & { key?: string | null }) => api("/api/ai/settings", { method: "PUT", body: input });

export const listModels = (override: { config?: AiConfig; key?: string } = {}) => api<string[]>("/api/ai/models", { method: "POST", body: override });

export const analyzeNotification = (sample: { appLabel: string; title: string; text: string; postedAt: string }, override: { config?: AiConfig; key?: string } = {}) =>
  api<AnalysisResult>("/api/ai/analyze-notification", { method: "POST", body: { sample, ...override } });
