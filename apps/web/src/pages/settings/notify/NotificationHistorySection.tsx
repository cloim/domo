import { Wand2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useDialog } from "../../../components/Dialogs.tsx";
import { notifySupported, type CapturedNotification } from "../../../lib/notify.ts";
import { matchNotificationHistory } from "../../../lib/notifyHistory.ts";
import { AppIcon, DeviceSelect, NoDevice } from "./NotifySection.tsx";
import { NotificationFields } from "./NotificationFields.tsx";
import { toLocalDateTime, useAppIcons, useInstalledApps, useNotifications, useNotifySource, useTargets, useTemplates } from "./useNotify.ts";

/** 설정 > 자동 기록 > 알림 이력: 모든 대상 앱의 알림을 최신순으로 모은다. */
export function NotificationHistorySection() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const source = useNotifySource();
  const notifications = useNotifications(source, "", 500, true);
  const targets = useTargets(source);
  const apps = useInstalledApps(source);
  const templates = useTemplates(source);
  const items = notifications.data ?? [];
  const icons = useAppIcons(source, [...new Set(items.map((n) => n.packageName))]);
  const appName = (pkg: string) => targets.data?.find((t) => t.packageName === pkg)?.label ?? apps.data?.find((a) => a.packageName === pkg)?.label ?? pkg;

  async function register(n: CapturedNotification) {
    if (!templates.data) {
      await dialog.alert("패턴을 확인해 주세요", templates.error?.message ?? "패턴을 불러오는 중이에요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const prefill = matchNotificationHistory(n, templates.data, toLocalDateTime(n.postedAt));
    if (!prefill) {
      await dialog.alert("일치하는 패턴이 없어요", "이 앱의 활성화된 템플릿 패턴과 비교했어요. 알림에 맞는 템플릿을 만들거나 기존 패턴을 수정해 주세요.");
      return;
    }
    navigate("/records", { state: { prefill } });
  }

  if (!source) return <NoDevice />;

  return (
    <section className="notification-history-page" aria-label="모든 앱 알림 이력">
      <div className="notification-history-head">
        {!notifySupported && <DeviceSelect source={source} />}
        <p className="hint">모든 앱의 최근 알림을 최신순으로 보여줘요. 최근 30일, 최대 500건을 확인할 수 있어요.</p>
      </div>
      {notifications.isPending ? (
        <span className="skeleton" style={{ display: "block", height: 160 }} aria-label="알림 불러오는 중" />
      ) : notifications.isError ? (
        <div className="readonly-note is-bad" role="alert">
          <p>알림 이력을 불러오지 못했어요. {notifications.error.message}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void notifications.refetch()}>다시 시도</button>
        </div>
      ) : items.length === 0 ? (
        <div className="md-empty">아직 받은 알림이 없어요. 알림 연동에 추가한 앱의 알림이 여기에 쌓입니다.</div>
      ) : (
        <ul className="notify-list" tabIndex={0} aria-label="모든 앱 알림 목록">
          {items.map((n) => {
            const template = templates.data?.find((t) => t.id === n.matchedTemplateId);
            return (
              <li key={n.id}>
                <AppIcon src={icons.data?.[n.packageName]} />
                <div className="notify-body">
                  <span className="hint">{appName(n.packageName)}</span>
                  <strong>{n.title}</strong>
                  <span className="notification-history-text">{n.text}</span>
                  <time className="hint" dateTime={new Date(n.postedAt).toISOString()}>{toLocalDateTime(n.postedAt).replace("T", " ")}</time>
                  {(n.duplicateCount ?? 1) > 1 && <span className="hint">동일 수신 기록 {n.duplicateCount}건을 합쳐 표시했어요.</span>}
                  <NotificationFields notification={n} />
                  {template && <span className="badge badge-accent" style={{ alignSelf: "flex-start" }}>{template.name}</span>}
                </div>
                <div className="notification-history-actions">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={templates.isPending} onClick={() => void register(n)} aria-label={`${appName(n.packageName)} ${n.title || "알림"} 등록하기`}>등록하기</button>
                {!template && (
                  <button type="button" className="icon-btn notify-template-action" aria-label={`${appName(n.packageName)} ${n.title || "알림"} 템플릿 만들기`} title="템플릿 만들기" onClick={() => navigate(`/settings/notify-templates?id=new&from=${n.id}&app=${encodeURIComponent(n.packageName)}`)}>
                    <Wand2 size={17} aria-hidden="true" />
                  </button>
                )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
