import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useDialog } from "../../components/Dialogs.tsx";
import { DomoWidget, type WidgetAppearance } from "../../lib/widget.ts";

export function WidgetSection() {
  const appearance = useQuery({ queryKey: ["widget", "appearance"], queryFn: () => DomoWidget.getAppearance() });
  if (appearance.isPending) return <span className="skeleton" style={{ display: "block", height: 240 }} aria-label="위젯 설정 불러오는 중" />;
  if (appearance.isError) return <div role="alert"><p>위젯 설정을 불러오지 못했어요. {appearance.error.message}</p><button type="button" className="btn btn-ghost" onClick={() => void appearance.refetch()}>다시 시도</button></div>;
  return <WidgetAppearanceEditor initial={appearance.data} />;
}

function WidgetAppearanceEditor({ initial }: { initial: WidgetAppearance }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dialog = useDialog();
  const qc = useQueryClient();
  const rgb = draft.backgroundColor.slice(1).match(/.{2}/g)!.map((v) => parseInt(v, 16));
  const dark = rgb[0]! * 299 + rgb[1]! * 587 + rgb[2]! * 114 < 150000;
  async function save() {
    setSaving(true);
    try {
      await DomoWidget.setAppearance(draft);
      qc.setQueryData(["widget", "appearance"], draft);
      await dialog.alert("저장했습니다", "홈 화면의 모든 도모 위젯에 적용했어요.");
    } catch (error) {
      await dialog.alert("저장하지 못했습니다", (error as Error).message);
    } finally { setSaving(false); }
  }
  return (
    <section className="widget-settings">
      <div className="widget-preview-stage" aria-label="위젯 배경 미리보기">
        <div className={`widget-preview${dark ? " is-dark" : ""}`}>
          <div className="widget-preview-background" style={{ backgroundColor: draft.backgroundColor, opacity: 1 - draft.transparency / 100 }} />
          <span>도모 월 잔액</span><strong>1,250,000원</strong><small>미리보기</small><span className="widget-preview-add">＋ 기록 추가</span>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="widget-color">배경 색상</label>
        <input id="widget-color" className="widget-color-input" type="color" value={draft.backgroundColor} disabled={saving} onChange={(e) => setDraft({ ...draft, backgroundColor: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="widget-transparency">배경 투명도 <output>{draft.transparency}%</output></label>
        <input id="widget-transparency" type="range" min="0" max="100" step="1" value={draft.transparency} disabled={saving} aria-valuetext={`${draft.transparency}%`} onChange={(e) => setDraft({ ...draft, transparency: Number(e.target.value) })} />
        <span className="hint">0%는 불투명, 100%는 완전 투명이에요. 글자는 선명하게 유지돼요.</span>
      </div>
      <button type="button" className="btn btn-primary" disabled={saving || (draft.backgroundColor === initial.backgroundColor && draft.transparency === initial.transparency)} onClick={() => void save()}>{saving ? "저장 중" : "저장"}</button>
    </section>
  );
}
