import { AI_PROVIDERS, AI_TEST_SAMPLE, aiConfigSchema, aiFormatOf, type AiConfig, type AiProviderId } from "@domo/core";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, FlaskConical, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "../../../components/Dialogs.tsx";
import SelectControl from "../../../components/SelectControl/index.ts";
import { aiKeys, analyzeNotification, listModels, saveAiSettings, useAiSettings, type AnalysisResult } from "../../../lib/ai.ts";
import { formatWon } from "../../../lib/format.ts";

type TestState = { status: "running" } | { status: "ok"; result: AnalysisResult } | { status: "error"; ms: number; message: string };

const presetConfig = (id: AiProviderId): AiConfig => {
  const p = AI_PROVIDERS.find((x) => x.id === id)!;
  return { provider: p.id, baseUrl: p.baseUrl, model: p.model };
};

/** 설정 > 자동 기록 > AI 설정. PC와 앱 모두에서 쓰며, 설정과 키는 계정별로 서버에 암호화해 둔다. */
export function AiSection() {
  const dialog = useDialog();
  const qc = useQueryClient();
  const settings = useAiSettings();
  const [config, setConfig] = useState<AiConfig>(() => presetConfig("gemini"));
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [test, setTest] = useState<TestState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setConfig({ provider: settings.data.provider, baseUrl: settings.data.baseUrl, model: settings.data.model });
  }, [settings.data]);

  const format = aiFormatOf(config.provider);
  const hasKey = !!settings.data?.hasKey;
  const canCall = !!key.trim() || hasKey;
  const edit = (patch: Partial<AiConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setTest(null);
  };

  /** 화면에 입력된 값으로 시험한다. 키를 새로 입력하지 않았으면 저장된 키를 쓴다. */
  const override = () => {
    const parsed = aiConfigSchema.safeParse(config);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "설정을 확인해 주세요.");
    return { config: parsed.data, ...(key.trim() ? { key: key.trim() } : {}) };
  };

  async function loadModels() {
    setLoadingModels(true);
    try {
      const list = await listModels(override());
      setModels(list);
      if (list.length === 0) await dialog.alert("모델 목록이 없어요", "이 서비스는 모델 목록을 주지 않아요. 모델 이름을 직접 입력해 주세요.");
    } catch (err) {
      setModels([]);
      await dialog.alert("모델 목록을 받지 못했습니다", `${(err as Error).message}\n모델 이름을 직접 입력할 수 있어요.`);
    } finally {
      setLoadingModels(false);
    }
  }

  /** 예시 카드 승인 알림을 실제로 분석해 연결, 응답 형식, 정규식 품질을 한 번에 확인한다. */
  async function runTest() {
    setTest({ status: "running" });
    const started = performance.now();
    try {
      setTest({ status: "ok", result: await analyzeNotification(AI_TEST_SAMPLE, override()) });
    } catch (err) {
      setTest({ status: "error", ms: Math.round(performance.now() - started), message: (err as Error).message });
    }
  }

  async function save() {
    const parsed = aiConfigSchema.safeParse(config);
    if (!parsed.success) {
      await dialog.alert("저장하지 못했습니다", parsed.error.issues[0]?.message ?? "설정을 확인해 주세요.");
      return;
    }
    setSaving(true);
    try {
      await saveAiSettings({ ...parsed.data, ...(key.trim() ? { key: key.trim() } : {}) });
      setKey("");
      await qc.invalidateQueries({ queryKey: aiKeys.settings });
      await dialog.alert("저장했습니다", "AI 설정을 저장했어요. 휴대폰의 알림 템플릿에서도 'AI로 정규식 만들기'를 쓸 수 있습니다.");
    } catch (err) {
      await dialog.alert("저장하지 못했습니다", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    const ok = await dialog.confirm({ title: "API 키 삭제", message: "저장된 API 키를 지울까요?", confirmLabel: "삭제", danger: true });
    if (!ok || !settings.data) return;
    try {
      await saveAiSettings({ provider: settings.data.provider, baseUrl: settings.data.baseUrl, model: settings.data.model, key: null });
      await qc.invalidateQueries({ queryKey: aiKeys.settings });
    } catch (err) {
      await dialog.alert("삭제하지 못했습니다", (err as Error).message);
    }
  }

  if (settings.isPending) return <span className="skeleton" style={{ display: "block", height: 240 }} />;

  return (
    <>
      <section className="field">
        <div className="section-head">
          <h2>AI 서비스</h2>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          휴대폰 알림 문구를 분석해 정규식 템플릿을 만들 때 써요. 분석을 누른 알림 한 건만 서버를 거쳐 AI 서비스로 보내고 저장하지 않아요. API 키는 계정별로 서버에 암호화해 두고 화면에는 보여주지 않습니다.
        </p>
        <div className="field">
          <label className="field-label" htmlFor="ai-provider">
            사업자
          </label>
          <SelectControl
            id="ai-provider"
            value={config.provider}
            onChange={(e) => {
              setConfig(presetConfig(e.target.value as AiProviderId));
              setModels(null);
              setTest(null);
            }}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </SelectControl>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ai-url">
            {format === "gemini" ? "엔드포인트" : "주소 (OpenAI 호환)"}
          </label>
          <input
            id="ai-url"
            className="input mono"
            spellCheck={false}
            placeholder={format === "gemini" ? "https://.../models/{model}:streamGenerateContent" : "https://.../v1"}
            value={config.baseUrl}
            onChange={(e) => edit({ baseUrl: e.target.value })}
          />
          {format === "gemini" && <span className="hint">{"{model}"} 자리에 아래 모델 이름이 들어가요. API 키는 x-goog-api-key 헤더로 보냅니다.</span>}
        </div>
      </section>

      <section className="field">
        <label className="field-label" htmlFor="ai-key">
          <span>API 키</span>
          {hasKey && (
            <span className="badge badge-accent">
              <KeyRound size={12} aria-hidden="true" style={{ marginRight: 4 }} /> 등록됨
            </span>
          )}
        </label>
        <div className="inline-form">
          <input
            id="ai-key"
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={hasKey ? "바꿀 때만 입력" : "API 키 붙여넣기"}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setTest(null);
            }}
          />
          {hasKey && (
            <button type="button" className="icon-btn danger" aria-label="API 키 삭제" title="API 키 삭제" onClick={() => void removeKey()}>
              <Trash2 size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      <section className="field">
        <label className="field-label" htmlFor="ai-model">
          모델
        </label>
        <div className="inline-form">
          {models && models.length > 0 ? (
            <SelectControl id="ai-model" value={config.model} onChange={(e) => edit({ model: e.target.value })}>
              <option value="" disabled>
                모델 선택
              </option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </SelectControl>
          ) : (
            <input id="ai-model" className="input mono" spellCheck={false} placeholder={format === "gemini" ? "gemini-3.6-flash" : "목록 불러오기 또는 직접 입력"} value={config.model} onChange={(e) => edit({ model: e.target.value })} />
          )}
          {format === "openai" && (
            <button type="button" className="btn btn-ghost" disabled={loadingModels || !canCall} onClick={() => void loadModels()}>
              <RefreshCw size={15} aria-hidden="true" /> {loadingModels ? "불러오는 중" : "목록"}
            </button>
          )}
        </div>
      </section>

      <section className="field">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h2>연결 테스트</h2>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!canCall || !config.model.trim() || test?.status === "running"} onClick={() => void runTest()}>
            <FlaskConical size={15} aria-hidden="true" /> {test?.status === "running" ? "테스트 중" : "테스트"}
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          아래 예시 카드 승인 알림을 실제로 분석해 응답과 정규식을 확인해요. 키를 새로 입력했다면 저장하기 전에 그 키로 테스트합니다.
        </p>
        <div className="readonly-note mono" style={{ display: "block", whiteSpace: "pre-wrap" }}>
          {AI_TEST_SAMPLE.title}
          {"\n"}
          {AI_TEST_SAMPLE.text}
        </div>
        {test && test.status !== "running" && <TestResult test={test} />}
      </section>

      <section>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          저장
        </button>
      </section>
    </>
  );
}

function TestResult({ test }: { test: Exclude<TestState, { status: "running" }> }) {
  if (test.status === "error") {
    return (
      <div className="test-result is-bad" role="alert">
        <CircleX size={18} aria-hidden="true" />
        <div>
          <strong>실패 ({(test.ms / 1000).toFixed(1)}초)</strong>
          <p>{test.message}</p>
        </div>
      </div>
    );
  }
  const { suggestion, problem, match, elapsedMs } = test.result;
  const good = !problem && !!match;
  return (
    <div className={`test-result${good ? "" : " is-warn"}`} role="status">
      {good ? <CircleCheck size={18} aria-hidden="true" /> : <CircleX size={18} aria-hidden="true" />}
      <div>
        <strong>
          {good ? "정상 동작" : "응답은 받았지만 정규식에 문제가 있어요"} ({(elapsedMs / 1000).toFixed(1)}초)
        </strong>
        {match && (
          <p>
            추출: {match.kind === "income" ? "수입" : "지출"} {formatWon(match.amount)}원{match.counterparty ? `, ${match.counterparty}` : ""}, {match.occurredAt.replace("T", " ")}
          </p>
        )}
        {problem && <p>{problem}</p>}
        <p className="hint">템플릿 이름: {suggestion.name}</p>
        <code className="mono test-pattern">{suggestion.pattern}</code>
      </div>
    </div>
  );
}
