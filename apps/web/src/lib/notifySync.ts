import type { NotifyDeviceConfig } from "@domo/core";
import { API_BASE, api, session } from "./api.ts";
import { DomoNotify, notifySupported } from "./notify.ts";

let deviceId: string | null = null;

/** 이 휴대폰의 기기 ID. 동기화 전이면 null */
export const notifyDeviceId = () => deviceId;

/**
 * 앱을 열거나 돌아올 때 부른다.
 * 1) 알림 감시 서비스가 쓸 세션과 서버 주소를 넘기고 기기를 계정에 등록한다.
 * 2) 서버 사본이 더 새로우면(PC에서 고친 경우) 받아 적용하고, 서버에 사본이 없으면 기기 설정을 올린다.
 * 3) 설치 앱 목록을 올리고(PC의 대상 앱 추가용) 밀린 알림을 올린다.
 */
export async function syncNotifyDevice({ uploadApps }: { uploadApps: boolean }): Promise<boolean> {
  const token = session.get();
  if (!notifySupported || !token) return false;
  const info = await DomoNotify.configureSync({ apiBase: API_BASE, token });
  deviceId = info.deviceId;
  const { configVersion: serverVersion } = await api<{ configVersion: number }>(`/api/notify/devices/${info.deviceId}`, { method: "PUT", body: { name: info.deviceName } });

  let changed = false;
  if (serverVersion > info.configVersion) {
    const remote = await api<NotifyDeviceConfig & { version: number }>(`/api/notify/devices/${info.deviceId}/config`);
    await DomoNotify.applyConfig({ targets: remote.targets, templates: remote.templates, version: remote.version });
    changed = true;
  } else if (serverVersion === 0) {
    // v0.2.x 에서 만든 설정을 처음 올린다.
    const [{ targets }, { templates }] = await Promise.all([DomoNotify.getTargets(), DomoNotify.getTemplates()]);
    if (targets.length + templates.length > 0) {
      const { version } = await api<{ version: number }>(`/api/notify/devices/${info.deviceId}/config`, { method: "PUT", body: { targets, templates } });
      await DomoNotify.setConfigVersion({ version });
    }
  }

  if (uploadApps) {
    const { apps } = await DomoNotify.listApps();
    await api(`/api/notify/devices/${info.deviceId}/apps`, {
      method: "PUT",
      body: { apps: apps.map((a) => ({ packageName: a.packageName, label: a.label, launchable: a.launchable })) },
    });
  }
  await DomoNotify.syncNow();
  return changed;
}
