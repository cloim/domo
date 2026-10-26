import { applyNotifyTemplate, notificationMatchText, NOTIFY_MATCH_FIELDS, validateNotifyPattern, type NotifyTemplate, type NotifyMatchField, type TransactionKind } from "@domo/core";
import { ChevronLeft, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useDialog } from "../../../components/Dialogs.tsx";
import SelectControl from "../../../components/SelectControl/index.ts";
import { analyzeNotification, useAiSettings } from "../../../lib/ai.ts";
import { formatWon } from "../../../lib/format.ts";
import { notifySupported, type NotifyTarget } from "../../../lib/notify.ts";
import { useHousehold, type HouseholdData } from "../../../lib/queries.ts";
import { MD_TWO_PANE, useMedia } from "../../../lib/useMedia.ts";
import { AppIcon, DeviceSelect, NoDevice } from "./NotifySection.tsx";
import { toLocalDateTime, useAppIcons, useNotifications, useNotifySource, useSaveTemplates, useTargets, useTemplates, type NotifySource } from "./useNotify.ts";

const NEW = "new";
const KIND_LABEL: Record<TransactionKind, string> = { expense: "지출", income: "수입" };

/** 설정 > 자동 기록 > 알림 템플릿 */
export function TemplatesSection() {
  const { data } = useHousehold();
  const source = useNotifySource();
  const templates = useTemplates(source);
  const targets = useTargets(source);
  const [params, setParams] = useSearchParams();
  const twoPane = useMedia(MD_TWO_PANE);
  const list = templates.data ?? [];
  const icons = useAppIcons(source, [...new Set(list.map((t) => t.packageName))]);
  const label = (pkg: string) => targets.data?.find((t) => t.packageName === pkg)?.label ?? pkg;

  const requested = params.get("id");
  const selectedId = requested ?? (twoPane ? (list[0]?.id ?? null) : null);
  const selected = list.find((t) => t.id === selectedId) ?? null;
  const select = (id: string | null) => {
    const next = new URLSearchParams();
    if (id) next.set("id", id);
    setParams(next, { replace: !twoPane && !id });
  };

  if (!source) return <NoDevice />;

  return (
    <div className={`md${selectedId ? " has-selection" : ""}`}>
      <section className="md-list" aria-label="알림 템플릿 목록">
        {!notifySupported && (
          <div className="md-list-head">
            <DeviceSelect source={source} />
          </div>
        )}
        <div className="md-list-body" style={notifySupported ? { paddingTop: 12 } : undefined}>
          {templates.isPending ? (
            <span className="skeleton" style={{ display: "block", height: 112, margin: "0 8px" }} />
          ) : list.length === 0 ? (
            <p className="hint" style={{ padding: "12px 10px" }}>
              알림 이력에서 알림을 골라 템플릿을 만들면, 같은 형식의 알림이 올 때 도모 등록 알림이 떠요.
            </p>
          ) : (
            list.map((t) => (
              <button key={t.id} type="button" className={`md-item${t.enabled ? "" : " is-off"}`} aria-current={t.id === selectedId} onClick={() => select(t.id)}>
                <AppIcon src={icons.data?.[t.packageName]} />
                <span className="md-item-main">
                  <strong>{t.name}</strong>
                  <span className="md-item-sub">
                    <span>{label(t.packageName)}</span>
                    <span className="sep" aria-hidden="true" />
                    <span>{KIND_LABEL[t.kind]}</span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="md-list-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={() => select(NEW)} disabled={(targets.data ?? []).length === 0}>
            <Plus size={17} aria-hidden="true" /> 템플릿 추가
          </button>
        </div>
      </section>

      <section className="md-detail" aria-label="알림 템플릿 상세">
        {data && targets.data && templates.data && (selectedId === NEW || selected) ? (
          <TemplateEditor key={`${source.deviceId}:${selectedId ?? ""}`} source={source} data={data} targets={targets.data} all={templates.data} template={selected} onBack={() => select(null)} onSaved={select} />
        ) : (
          <div className="md-empty">템플릿을 골라 주세요.</div>
        )}
      </section>
    </div>
  );
}

interface EditorProps {
  source: NotifySource;
  data: HouseholdData;
  targets: NotifyTarget[];
  all: NotifyTemplate[];
  template: NotifyTemplate | null;
  onBack: () => void;
  onSaved: (id: string) => void;
}

function TemplateEditor({ source, data, targets, all, template, onBack, onSaved }: EditorProps) {
  const dialog = useDialog();
  const save = useSaveTemplates(source);
  const [params] = useSearchParams();
  const fromId = Number(params.get("from")) || null;
  const fromApp = params.get("app");

  const [draft, setDraft] = useState<NotifyTemplate>(
    () =>
      template ? { ...template, matchField: template.matchField ?? "title_body" } : {
        id: crypto.randomUUID(),
        name: "",
        packageName: fromApp ?? targets[0]?.packageName ?? "",
        kind: "expense",
        pattern: "",
        paymentMethodId: null,
        categoryId: null,
        enabled: true,
        sampleTitle: "",
        sampleText: "",
        matchField: "title_body",
        sampleRawText: "",
        sampleBigText: "",
      },
  );
  const [samplePostedAt, setSamplePostedAt] = useState(() => toLocalDateTime(Date.now()));
  const [parentId, setParentId] = useState(() => data.categories.find((c) => c.id === template?.categoryId)?.parentId ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiProblem, setAiProblem] = useState<string | null>(null);
  const set = <K extends keyof NotifyTemplate>(key: K, value: NotifyTemplate[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const recent = useNotifications(source, draft.packageName, 500);
  const ai = useAiSettings();

  // 알림 이력 화면에서 '템플릿 만들기'로 들어오면 그 알림을 예시로 채운다.
  useEffect(() => {
    if (template || !fromId || !recent.data) return;
    const n = recent.data.find((x) => x.id === fromId);
    if (!n) return;
    setDraft((d) => (d.sampleText || d.sampleTitle ? d : { ...d, sampleTitle: n.title, sampleText: n.text, sampleRawText: n.rawText, sampleBigText: n.bigText }));
    setSamplePostedAt(toLocalDateTime(n.postedAt));
  }, [template, fromId, recent.data]);

  const patternProblem = draft.pattern ? validateNotifyPattern(draft.pattern) : null;
  const sampleFields = { rawText: draft.sampleRawText, bigText: draft.sampleBigText };
  const matchingText = notificationMatchText(draft.matchField ?? "title_body", { title: draft.sampleTitle, text: draft.sampleText, ...sampleFields });
  const sampleResult = draft.pattern && !patternProblem ? applyNotifyTemplate(draft, draft.sampleTitle, draft.sampleText, samplePostedAt, sampleFields) : null;
  const recentMatches = useMemo(() => {
    if (!draft.pattern || patternProblem || !recent.data) return null;
    return recent.data.filter((n) => applyNotifyTemplate(draft, n.title, n.text, toLocalDateTime(n.postedAt), n));
  }, [draft, patternProblem, recent.data]);

  const methods = data.paymentMethods.filter((m) => !m.archived || m.id === draft.paymentMethodId);
  const parents = data.categories.filter((c) => c.kind === draft.kind && !c.parentId && !c.archived);
  const children = data.categories.filter((c) => c.parentId === parentId && !c.archived);
  const aiReady = !!ai.data?.hasKey && !!ai.data.model;
  const appLabel = targets.find((t) => t.packageName === draft.packageName)?.label ?? draft.packageName;

  async function analyze() {
    setAnalyzing(true);
    setAiProblem(null);
    try {
      const { suggestion, problem } = await analyzeNotification({ appLabel, title: draft.sampleTitle, text: draft.sampleText, postedAt: samplePostedAt, matchField: draft.matchField, ...sampleFields });
      setDraft((d) => ({ ...d, name: d.name || suggestion.name, kind: suggestion.kind, pattern: suggestion.pattern }));
      setAiProblem(problem);
    } catch (err) {
      await dialog.alert("분석하지 못했습니다", (err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = !draft.name.trim() ? "템플릿 이름을 입력해 주세요." : !draft.packageName ? "대상 앱을 골라 주세요." : validateNotifyPattern(draft.pattern);
    if (problem) {
      await dialog.alert("저장하지 못했습니다", problem);
      return;
    }
    const next = { ...draft, name: draft.name.trim() };
    const others = all.filter((t) => t.id !== next.id);
    try {
      await save.mutateAsync(template ? all.map((t) => (t.id === next.id ? next : t)) : [...others, next]);
      await dialog.alert("저장했습니다", `${next.name} 템플릿을 저장했어요. 같은 형식의 알림이 오면 도모 등록 알림이 뜹니다.`);
      if (!template) onSaved(next.id);
    } catch (err) {
      await dialog.alert("저장하지 못했습니다", (err as Error).message);
    }
  }

  async function onDelete() {
    if (!template) return;
    const ok = await dialog.confirm({ title: "템플릿 삭제", message: `${template.name} 템플릿을 삭제할까요?`, confirmLabel: "삭제", danger: true });
    if (!ok) return;
    await save.mutateAsync(all.filter((t) => t.id !== template.id));
    onBack();
  }

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <div className="md-detail-head">
        <button type="button" className="icon-btn md-back" aria-label="목록으로" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2>{template ? template.name : "새 템플릿"}</h2>
        {template && <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => void onDelete()}><Trash2 size={16} aria-hidden="true" /> 삭제</button>}
        <button type="submit" className="btn btn-primary btn-sm" disabled={save.isPending}>{save.isPending ? "저장 중" : template ? "저장" : "추가"}</button>
      </div>
      <div className="md-detail-body md-detail-body-fill">
        <div className="template-settings-row">
          <div className="field">
            <label className="field-label" htmlFor="nt-app">
              대상 앱
            </label>
            <SelectControl id="nt-app" value={draft.packageName} onChange={(e) => set("packageName", e.target.value)}>
              {targets.map((t) => (
                <option key={t.packageName} value={t.packageName}>
                  {t.label}
                </option>
              ))}
            </SelectControl>
          </div>
          <div className="field">
            <span className="field-label">종류</span>
            <div className="segmented template-kind-tabs" role="group" aria-label="종류">
              {(["expense", "income"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={draft.kind === k} onClick={() => (set("kind", k), set("categoryId", null), setParentId(""))}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">사용 여부</span>
            <div className="template-enabled-control">
              <label className="switch">
                <span>{draft.enabled ? "사용 중" : "멈춤"}</span>
                <input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
              </label>
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">예시 알림</span>
          <input className="input" aria-label="예시 알림 제목 title" placeholder="title, 제목" value={draft.sampleTitle} onChange={(e) => set("sampleTitle", e.target.value)} />
          <textarea className="input" aria-label="예시 알림 text" placeholder="text, 기본 본문" rows={3} value={draft.sampleRawText ?? ""} onChange={(e) => setDraft((d) => ({ ...d, sampleRawText: e.target.value, sampleText: d.sampleBigText?.trim() ? d.sampleBigText : e.target.value }))} />
          <textarea className="input" aria-label="예시 알림 bigText" placeholder="bigText, 펼친 본문" rows={3} value={draft.sampleBigText ?? ""} onChange={(e) => setDraft((d) => ({ ...d, sampleBigText: e.target.value, sampleText: e.target.value.trim() ? e.target.value : d.sampleRawText ?? d.sampleText }))} />
          {draft.sampleRawText == null && draft.sampleBigText == null && draft.sampleText && <p className="hint">이전 알림은 원본 text와 bigText를 수집하지 않았어요. 기존 body는 제목+본문 또는 본문 자동으로 검사할 수 있습니다.</p>}
          <label className="field-label" htmlFor="nt-match-field">매칭할 필드</label>
          <SelectControl id="nt-match-field" value={draft.matchField ?? "title_body"} onChange={(e) => set("matchField", e.target.value as NotifyMatchField)}>
            {NOTIFY_MATCH_FIELDS.map((field) => <option key={field} value={field}>{{ title_body: "제목 + 자동 본문", body: "자동 본문 (body)", title: "제목 (title)", text: "기본 본문 (text)", bigText: "펼친 본문 (bigText)" }[field]}</option>)}
          </SelectControl>
          <span className="hint">자동 본문은 비어 있지 않은 bigText를 우선 사용하고, 없으면 text를 사용해요.</span>
          <label className="field-label" htmlFor="nt-match-preview">실제 매칭 원문</label>
          <textarea id="nt-match-preview" className="input mono" rows={3} value={matchingText} readOnly />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!aiReady || analyzing || !(draft.sampleTitle || draft.sampleText)} onClick={() => void analyze()}>
              <Sparkles size={15} aria-hidden="true" /> {analyzing ? "분석 중" : "AI로 정규식 만들기"}
            </button>
            {!aiReady && (
              <span className="hint">
                <Link to="/settings/ai">AI 설정</Link>에서 키와 모델을 등록하면 쓸 수 있어요. 직접 입력도 됩니다.
              </span>
            )}
          </div>
          {aiProblem && <span className="field-error">{aiProblem}</span>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="nt-name">
            템플릿 이름
          </label>
          <input id="nt-name" className="input" maxLength={40} placeholder="예: 신한카드 승인" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="nt-pattern">
            정규식
          </label>
          <textarea
            id="nt-pattern"
            className="input mono"
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={!!patternProblem}
            placeholder="예: 승인 \S+ (?<amount>[\d,]+)원 .* (?<counterparty>\S+) 누적"
            value={draft.pattern}
            onChange={(e) => set("pattern", e.target.value)}
          />
          <span className="hint">선택한 필드의 원문에 적용해요. 이름 그룹: amount(필수), counterparty, memo, month, day, hour, minute</span>
          {patternProblem && <span className="field-error">{patternProblem}</span>}
          {draft.pattern && !patternProblem && (draft.sampleTitle || draft.sampleText) && (
            <div className={`readonly-note${sampleResult ? "" : " is-bad"}`}>
              {sampleResult
                ? `예시 결과: ${KIND_LABEL[sampleResult.kind]} ${formatWon(sampleResult.amount)}원${sampleResult.counterparty ? `, ${sampleResult.counterparty}` : ""}, ${sampleResult.occurredAt.replace("T", " ")}`
                : "예시 알림에 맞지 않아요."}
            </div>
          )}
          {recentMatches && recent.data && <span className="hint">최근 알림 {recent.data.length}건 중 {recentMatches.length}건이 맞아요.</span>}
        </div>

        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="nt-method">
              <span>
                지출수단 <span className="field-optional">(선택)</span>
              </span>
            </label>
            <SelectControl id="nt-method" value={draft.paymentMethodId ?? ""} disabled={draft.kind === "income"} onChange={(e) => set("paymentMethodId", e.target.value || null)}>
              <option value="">등록할 때 고르기</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectControl>
          </div>
          <div className="field">
            <span className="field-label">
              <span>
                분류 <span className="field-optional">(선택)</span>
              </span>
            </span>
            <div className="form-row">
              <SelectControl aria-label="대분류" value={parentId} onChange={(e) => (setParentId(e.target.value), set("categoryId", null))}>
                <option value="">자동 추천</option>
                {parents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectControl>
              <SelectControl aria-label="소분류" value={draft.categoryId ?? ""} disabled={!parentId} onChange={(e) => set("categoryId", e.target.value || null)}>
                <option value="">소분류</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectControl>
            </div>
          </div>
        </div>
        <span className="hint">분류를 비우면 같은 거래처의 예전 기록으로 추천해요.</span>

      </div>
    </form>
  );
}
