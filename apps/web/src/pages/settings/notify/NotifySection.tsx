import { BellRing, ChevronLeft, Plus, Search, ShieldAlert, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useDialog } from "../../../components/Dialogs.tsx";
import { Modal } from "../../../components/Modal/index.js";
import { DomoNotify, notifyHealth, type InstalledApp, type NotifyTarget } from "../../../lib/notify.ts";
import { MD_TWO_PANE, useMedia } from "../../../lib/useMedia.ts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyKeys, toLocalDateTime, useAppIcons, useNotifyStatus, useSaveTargets, useTargets, useTemplates } from "./useNotify.ts";

/** 설정 > 자동 기록 > 알림 연동: 권한 상태, 감시 대상 앱, 앱별 최근 알림 */
export function NotifySection() {
  const dialog = useDialog();
  const [params, setParams] = useSearchParams();
  const twoPane = useMedia(MD_TWO_PANE);
  const status = useNotifyStatus();
  const targets = useTargets();
  const saveTargets = useSaveTargets();
  const [picking, setPicking] = useState(false);

  const list = targets.data ?? [];
  const icons = useAppIcons(list.map((t) => t.packageName));
  const requested = params.get("app");
  const selectedPkg = requested ?? (twoPane ? (list[0]?.packageName ?? null) : null);
  const selected = list.find((t) => t.packageName === selectedPkg) ?? null;
  const select = (pkg: string | null) => {
    const next = new URLSearchParams(params);
    if (pkg) next.set("app", pkg);
    else next.delete("app");
    setParams(next, { replace: !twoPane && !pkg });
  };

  const update = (pkg: string, patch: Partial<NotifyTarget>) =>
    saveTargets.mutate(
      list.map((t) => (t.packageName === pkg ? { ...t, ...patch } : t)),
      { onError: (err) => void dialog.alert("저장하지 못했습니다", err.message) },
    );

  async function addApps(apps: InstalledApp[]) {
    const known = new Set(list.map((t) => t.packageName));
    const added = apps.filter((a) => !known.has(a.packageName)).map((a) => ({ packageName: a.packageName, label: a.label, enabled: true, removeOriginal: false }));
    await saveTargets.mutateAsync([...list, ...added]);
    setPicking(false);
    if (added[0]) select(added[0].packageName);
  }

  async function removeTarget(t: NotifyTarget) {
    const ok = await dialog.confirm({ title: "대상 앱 삭제", message: `${t.label}의 알림을 더 이상 보지 않을까요?\n이 앱의 템플릿은 남지만 동작하지 않습니다.`, confirmLabel: "삭제", danger: true });
    if (!ok) return;
    await saveTargets.mutateAsync(list.filter((x) => x.packageName !== t.packageName));
    await DomoNotify.clearNotifications({ packageName: t.packageName });
    select(null);
  }

  const health = status.data ? notifyHealth(status.data) : null;

  return (
    <div className={`md${selectedPkg ? " has-selection" : ""}`}>
      <section className="md-list" aria-label="알림 감시 대상 앱">
        <div className="md-list-head">
          <PermissionCard />
        </div>
        <div className="md-list-body">
          {targets.isPending ? (
            <span className="skeleton" style={{ display: "block", height: 112, margin: "0 8px" }} />
          ) : list.length === 0 ? (
            <p className="hint" style={{ padding: "12px 10px" }}>
              카드사, 은행, 간편결제 앱을 추가하면 그 앱의 알림을 모아 보여주고, 템플릿과 맞는 알림이 오면 도모 등록 알림을 띄워요.
            </p>
          ) : (
            list.map((t) => (
              <button key={t.packageName} type="button" className={`md-item${t.enabled ? "" : " is-off"}`} aria-current={t.packageName === selectedPkg} onClick={() => select(t.packageName)}>
                <AppIcon src={icons.data?.[t.packageName]} />
                <span className="md-item-main">
                  <strong>{t.label}</strong>
                  <span className="md-item-sub">
                    <span>{t.enabled ? "감시 중" : "멈춤"}</span>
                    {t.removeOriginal && (
                      <>
                        <span className="sep" aria-hidden="true" />
                        <span>원본 알림 제거</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            ))
          )}
          {health === "idle" && list.length > 0 && <p className="hint" style={{ padding: "12px 10px" }}>템플릿을 만들어야 등록 알림이 떠요. 앱을 골라 알림에서 템플릿을 만들어 주세요.</p>}
        </div>
        <div className="md-list-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={() => setPicking(true)}>
            <Plus size={17} aria-hidden="true" /> 대상 앱 추가
          </button>
        </div>
      </section>

      <section className="md-detail" aria-label="대상 앱 상세">
        {selected ? (
          <TargetDetail target={selected} icon={icons.data?.[selected.packageName]} onBack={() => select(null)} onUpdate={(p) => update(selected.packageName, p)} onRemove={() => void removeTarget(selected)} />
        ) : (
          <div className="md-empty">대상 앱을 골라 주세요.</div>
        )}
      </section>

      {picking && <AppPicker existing={list.map((t) => t.packageName)} onClose={() => setPicking(false)} onPick={(apps) => void addApps(apps)} />}
    </div>
  );
}

function PermissionCard() {
  const qc = useQueryClient();
  const status = useNotifyStatus();
  const refresh = () => qc.invalidateQueries({ queryKey: notifyKeys.status });
  if (!status.data) return <span className="skeleton" style={{ display: "block", height: 64 }} />;
  const s = status.data;
  if (s.listenerEnabled && s.postAllowed) {
    return (
      <div className="kv">
        <span className="hint">알림 감시</span>
        <strong style={{ color: s.connected ? "var(--income)" : "var(--accent)" }}>{s.connected ? "동작 중" : "연결 대기"}</strong>
      </div>
    );
  }
  return (
    <div className="notify-alert" role="alert">
      <ShieldAlert size={18} aria-hidden="true" />
      <div>
        <strong>권한이 필요해요</strong>
        <p>{!s.listenerEnabled ? "다른 앱의 알림을 읽으려면 '알림 접근'에서 도모를 허용해 주세요." : "도모가 등록 알림을 띄우려면 알림 표시를 허용해 주세요."}</p>
        <div style={{ display: "flex", gap: 8 }}>
          {!s.listenerEnabled && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void DomoNotify.openListenerSettings()}>
              알림 접근 열기
            </button>
          )}
          {!s.postAllowed && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void DomoNotify.requestPostPermission().then(refresh)}>
              알림 표시 허용
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
            다시 확인
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppIcon({ src }: { src?: string }) {
  return src ? <img className="app-icon" src={src} alt="" /> : <span className="md-item-icon"><BellRing size={17} aria-hidden="true" /></span>;
}

function TargetDetail({ target, icon, onBack, onUpdate, onRemove }: { target: NotifyTarget; icon?: string; onBack: () => void; onUpdate: (patch: Partial<NotifyTarget>) => void; onRemove: () => void }) {
  const navigate = useNavigate();
  const templates = useTemplates();
  const notifications = useQuery({
    queryKey: notifyKeys.notifications(target.packageName),
    queryFn: async () => (await DomoNotify.getNotifications({ packageName: target.packageName, limit: 100 })).notifications,
    refetchInterval: 15_000,
  });
  const templateName = (id: string | null) => templates.data?.find((t) => t.id === id)?.name;

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <div className="md-detail-head">
        <button type="button" className="icon-btn md-back" aria-label="목록으로" onClick={onBack}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <AppIcon src={icon} />
        <h2>{target.label}</h2>
        <button type="button" className="icon-btn danger" aria-label={`${target.label} 대상에서 삭제`} title="대상에서 삭제" onClick={onRemove}>
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="md-detail-body">
        <div className="field">
          <div className="field-label">
            <span>알림 감시</span>
            <label className="switch">
              <span>{target.enabled ? "사용 중" : "멈춤"}</span>
              <input type="checkbox" checked={target.enabled} onChange={(e) => onUpdate({ enabled: e.target.checked })} />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>
          <div className="field-label">
            <span>등록 알림을 띄우면 원본 알림 제거</span>
            <label className="switch">
              <span>{target.removeOriginal ? "제거" : "남김"}</span>
              <input type="checkbox" checked={target.removeOriginal} onChange={(e) => onUpdate({ removeOriginal: e.target.checked })} />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>
        </div>

        <section className="field" aria-labelledby="notify-recent">
          <h3 id="notify-recent" className="field-label" style={{ margin: 0 }}>
            최근 알림
          </h3>
          {notifications.isPending ? (
            <span className="skeleton" style={{ display: "block", height: 120 }} />
          ) : (notifications.data ?? []).length === 0 ? (
            <p className="hint">아직 받은 알림이 없어요. 이 앱에서 알림이 오면 여기에 쌓입니다(최근 200건, 30일).</p>
          ) : (
            <ul className="notify-list">
              {notifications.data!.map((n) => (
                <li key={n.id}>
                  <div className="notify-body">
                    <strong>{n.title}</strong>
                    <span>{n.text}</span>
                    <span className="hint">{toLocalDateTime(n.postedAt).replace("T", " ")}</span>
                  </div>
                  {n.matchedTemplateId ? (
                    <span className="badge badge-accent">{templateName(n.matchedTemplateId) ?? "템플릿"}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/settings/notify-templates?id=new&from=${n.id}&app=${encodeURIComponent(n.packageName)}`)}
                    >
                      <Wand2 size={15} aria-hidden="true" /> 템플릿 만들기
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function AppPicker({ existing, onClose, onPick }: { existing: string[]; onClose: () => void; onPick: (apps: InstalledApp[]) => void }) {
  const apps = useQuery({ queryKey: notifyKeys.apps, queryFn: async () => (await DomoNotify.listApps()).apps, staleTime: 60_000 });
  const [query, setQuery] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (apps.data ?? [])
      .filter((a) => !existing.includes(a.packageName))
      .filter((a) => showSystem || a.launchable)
      .filter((a) => !q || a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [apps.data, existing, query, showSystem]);
  // 아이콘은 화면에 보이는 앞쪽 일부만 불러온다.
  const icons = useAppIcons(visible.slice(0, 60).map((a) => a.packageName));

  const toggle = (pkg: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="대상 앱 추가"
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={picked.size === 0} onClick={() => onPick((apps.data ?? []).filter((a) => picked.has(a.packageName)))}>
            {picked.size > 0 ? `${picked.size}개 추가` : "추가"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="md-search">
          <Search size={16} aria-hidden="true" />
          <input className="input" type="search" placeholder="앱 이름" aria-label="앱 검색" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
        <label className="switch" style={{ alignSelf: "flex-start" }}>
          <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span>실행 아이콘이 없는 앱도 보기</span>
        </label>
        {apps.isPending ? (
          <span className="skeleton" style={{ display: "block", height: 200 }} />
        ) : (
          <ul className="app-pick-list">
            {visible.map((a) => (
              <li key={a.packageName}>
                <label className="md-item">
                  <input type="checkbox" checked={picked.has(a.packageName)} onChange={() => toggle(a.packageName)} />
                  <AppIcon src={icons.data?.[a.packageName]} />
                  <span className="md-item-main">
                    <strong>{a.label}</strong>
                    <span className="md-item-sub">{a.packageName}</span>
                  </span>
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="hint">맞는 앱이 없어요.</li>}
          </ul>
        )}
      </div>
    </Modal>
  );
}
