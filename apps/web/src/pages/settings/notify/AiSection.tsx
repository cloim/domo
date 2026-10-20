import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "../../../components/Dialogs.tsx";
import SelectControl from "../../../components/SelectControl/index.ts";
import { AI_PROVIDERS, listModels, type AiProviderId } from "../../../lib/ai.ts";
import { DomoNotify, type AiConfig } from "../../../lib/notify.ts";
import { notifyKeys } from "./useNotify.ts";
import { useQuery } from "@tanstack/react-query";

/** 설정 > 자동 기록 > AI 설정. 키는 기기의 Keystore 로 암호화해 기기에만 둔다. */
export function AiSection() {
  const dialog = useDialog();
  const qc = useQueryClient();
  const ai = useQuery({ queryKey: notifyKeys.ai, queryFn: () => DomoNotify.getAiConfig() });
  const [config, setConfig] = useState<AiConfig>({ provider: "anthropic", baseUrl: AI_PROVIDERS[0].baseUrl, model: "" });
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (ai.data?.config.provider) setConfig(ai.data.config);
  }, [ai.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: notifyKeys.ai });
  const provider = AI_PROVIDERS.find((p) => p.id === config.provider) ?? AI_PROVIDERS[0];

  function pickProvider(id: AiProviderId) {
    const p = AI_PROVIDERS.find((x) => x.id === id)!;
    setConfig({ provider: id, baseUrl: p.baseUrl || "", model: "" });
    setModels(null);
  }

  async function loadModels() {
    setLoadingModels(true);
    try {
      const list = await listModels(config, key.trim() || undefined);
      setModels(list);
      if (list.length === 0) await dialog.alert("모델 목록이 없어요", "이 서비스는 모델 목록을 주지 않아요. 모델 이름을 직접 입력해 주세요.");
    } catch (err) {
      setModels([]);
      await dialog.alert("모델 목록을 받지 못했습니다", `${(err as Error).message}\n모델 이름을 직접 입력할 수 있어요.`);
    } finally {
      setLoadingModels(false);
    }
  }

  async function save() {
    try {
      if (key.trim()) await DomoNotify.setAiKey({ key: key.trim() });
      await DomoNotify.setAiConfig({ config: { ...config, model: config.model?.trim() } });
      setKey("");
      await refresh();
      await dialog.alert("저장했습니다", "AI 설정을 저장했어요. 알림 템플릿에서 'AI로 정규식 만들기'를 쓸 수 있습니다.");
    } catch (err) {
      await dialog.alert("저장하지 못했습니다", (err as Error).message);
    }
  }

  async function removeKey() {
    const ok = await dialog.confirm({ title: "API 키 삭제", message: "이 기기에 저장된 API 키를 지울까요?", confirmLabel: "삭제", danger: true });
    if (!ok) return;
    await DomoNotify.deleteAiKey();
    await refresh();
  }

  if (ai.isPending) return <span className="skeleton" style={{ display: "block", height: 240 }} />;

  return (
    <>
      <section className="field">
        <div className="section-head">
          <h2>AI 서비스</h2>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          알림 문구를 분석해 정규식 템플릿을 만들 때만 써요. 분석을 누른 알림 한 건만 AI 서비스로 보내고, API 키는 이 기기에 암호화해 둡니다.
        </p>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="ai-provider">
              사업자
            </label>
            <SelectControl id="ai-provider" value={provider.id} onChange={(e) => pickProvider(e.target.value as AiProviderId)}>
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </SelectControl>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ai-url">
              주소 (OpenAI 호환)
            </label>
            <input id="ai-url" className="input" inputMode="url" spellCheck={false} placeholder="https://.../v1" value={config.baseUrl ?? ""} onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))} />
          </div>
        </div>
      </section>

      <section className="field">
        <label className="field-label" htmlFor="ai-key">
          <span>API 키</span>
          {ai.data?.hasKey && (
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
            placeholder={ai.data?.hasKey ? "바꿀 때만 입력" : "API 키 붙여넣기"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {ai.data?.hasKey && (
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
            <SelectControl id="ai-model" value={config.model ?? ""} onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}>
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
            <input id="ai-model" className="input" spellCheck={false} placeholder="목록 불러오기 또는 직접 입력" value={config.model ?? ""} onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))} />
          )}
          <button type="button" className="btn btn-ghost" disabled={loadingModels || !(key.trim() || ai.data?.hasKey)} onClick={() => void loadModels()}>
            <RefreshCw size={15} aria-hidden="true" /> {loadingModels ? "불러오는 중" : "목록"}
          </button>
        </div>
      </section>

      <section>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          저장
        </button>
      </section>
    </>
  );
}
