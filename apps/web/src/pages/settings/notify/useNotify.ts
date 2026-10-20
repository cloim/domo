import type { NotifyDeviceConfig, NotifyTemplate } from "@domo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "../../../lib/api.ts";
import { DomoNotify, notifySupported, type CapturedNotification, type InstalledApp, type NotifyTarget } from "../../../lib/notify.ts";
import { notifyDeviceId } from "../../../lib/notifySync.ts";

/**
 * 알림 연동 데이터의 출처.
 * - 앱: 이 휴대폰의 저장소(알림 감시 서비스가 바로 쓰는 값). 바꾸면 서버 사본에도 올린다.
 * - PC: 고른 휴대폰의 서버 사본. 바꾸면 그 휴대폰이 다음 동기화 때 받아 간다.
 */
export type NotifySource = { kind: "local"; deviceId: string | null } | { kind: "remote"; deviceId: string };

export interface NotifyDevice {
  id: string;
  name: string;
  lastSeenAt: string;
  targetCount: number;
  templateCount: number;
}

// ───── PC에서 고른 기기 (여러 화면이 같은 값을 쓰도록 작은 저장소로 둔다) ─────
const DEVICE_KEY = "domo.notifyDevice";
const listeners = new Set<() => void>();
const readPicked = () => {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
};
let picked = readPicked();
export function pickDevice(id: string) {
  picked = id;
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 기억한다.
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export const useDevices = () => useQuery({ queryKey: ["notify", "devices"], queryFn: () => api<NotifyDevice[]>("/api/notify/devices"), enabled: !notifySupported });

/** 지금 화면이 다룰 출처. PC에서 기기가 아직 없으면 null */
export function useNotifySource(): NotifySource | null {
  const current = useSyncExternalStore(subscribe, () => picked);
  const devices = useDevices();
  if (notifySupported) return { kind: "local", deviceId: notifyDeviceId() };
  const list = devices.data ?? [];
  const id = list.find((d) => d.id === current)?.id ?? list[0]?.id;
  return id ? { kind: "remote", deviceId: id } : null;
}

const srcKey = (src: NotifySource | null) => (src ? `${src.kind}:${src.deviceId ?? ""}` : "none");

export const notifyKeys = {
  all: ["notify"] as const,
  status: ["notify", "status"] as const,
  config: (src: NotifySource | null) => ["notify", "config", srcKey(src)] as const,
  notifications: (src: NotifySource | null, pkg: string) => ["notify", "notifications", srcKey(src), pkg] as const,
  apps: (src: NotifySource | null) => ["notify", "apps", srcKey(src)] as const,
  icons: (src: NotifySource | null, pkgs: string[]) => ["notify", "icons", srcKey(src), ...pkgs] as const,
};

// ───── 저장소 ─────

async function readConfig(src: NotifySource): Promise<NotifyDeviceConfig> {
  if (src.kind === "remote") {
    const c = await api<NotifyDeviceConfig & { version: number }>(`/api/notify/devices/${src.deviceId}/config`);
    return { targets: c.targets, templates: c.templates };
  }
  const [{ targets }, { templates }] = await Promise.all([DomoNotify.getTargets(), DomoNotify.getTemplates()]);
  return { targets, templates };
}

/** 대상 앱이나 템플릿을 바꾼다. 앱에서는 기기에 쓰고 서버 사본도 올려 버전을 맞춘다. */
async function writeConfig(src: NotifySource, patch: Partial<NotifyDeviceConfig>) {
  const next = { ...(await readConfig(src)), ...patch };
  if (src.kind === "local") {
    await DomoNotify.setTargets({ targets: next.targets });
    await DomoNotify.setTemplates({ templates: next.templates });
    if (!src.deviceId) return;
  }
  const { version } = await api<{ version: number }>(`/api/notify/devices/${src.deviceId}/config`, { method: "PUT", body: next });
  if (src.kind === "local") await DomoNotify.setConfigVersion({ version });
}

export const useNotifyStatus = () => useQuery({ queryKey: notifyKeys.status, queryFn: () => DomoNotify.getStatus(), refetchInterval: 30_000, enabled: notifySupported });

function useConfig(src: NotifySource | null) {
  return useQuery({ queryKey: notifyKeys.config(src), queryFn: () => readConfig(src!), enabled: !!src });
}

export const useTargets = (src: NotifySource | null) => {
  const q = useConfig(src);
  return { ...q, data: q.data?.targets as NotifyTarget[] | undefined };
};

export const useTemplates = (src: NotifySource | null) => {
  const q = useConfig(src);
  return { ...q, data: q.data?.templates as NotifyTemplate[] | undefined };
};

function useWriteConfig(src: NotifySource | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotifyDeviceConfig>) => writeConfig(src!, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: notifyKeys.all }),
  });
}

export function useSaveTargets(src: NotifySource | null) {
  const m = useWriteConfig(src);
  return { ...m, mutate: (targets: NotifyTarget[], opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ targets }, opts), mutateAsync: (targets: NotifyTarget[]) => m.mutateAsync({ targets }) };
}

export function useSaveTemplates(src: NotifySource | null) {
  const m = useWriteConfig(src);
  return { ...m, mutateAsync: (templates: NotifyTemplate[]) => m.mutateAsync({ templates }) };
}

export function useNotifications(src: NotifySource | null, packageName: string, limit = 100, refetch = false) {
  return useQuery({
    queryKey: notifyKeys.notifications(src, packageName),
    enabled: !!src && !!packageName,
    refetchInterval: refetch ? 15_000 : false,
    queryFn: async (): Promise<CapturedNotification[]> =>
      src!.kind === "local"
        ? (await DomoNotify.getNotifications({ packageName, limit })).notifications
        : api<CapturedNotification[]>(`/api/notify/devices/${src!.deviceId}/notifications?packageName=${encodeURIComponent(packageName)}&limit=${limit}`),
  });
}

export async function clearNotifications(src: NotifySource, packageName: string) {
  if (src.kind === "local") await DomoNotify.clearNotifications({ packageName });
  if (src.deviceId) await api(`/api/notify/devices/${src.deviceId}/notifications?packageName=${encodeURIComponent(packageName)}`, { method: "DELETE" }).catch(() => {});
}

export function useInstalledApps(src: NotifySource | null) {
  return useQuery({
    queryKey: notifyKeys.apps(src),
    enabled: !!src,
    staleTime: 60_000,
    queryFn: async (): Promise<InstalledApp[]> =>
      src!.kind === "local"
        ? (await DomoNotify.listApps()).apps
        : (await api<{ packageName: string; label: string; launchable: boolean }[]>(`/api/notify/devices/${src!.deviceId}/apps`)).map((a) => ({ ...a, system: false })),
  });
}

/** 앱 아이콘은 휴대폰에서만 그린다. PC에서는 기본 아이콘을 쓴다. */
export const useAppIcons = (src: NotifySource | null, packages: string[]) =>
  useQuery({
    queryKey: notifyKeys.icons(src, packages),
    queryFn: async () => (await DomoNotify.getAppIcons({ packages })).icons,
    enabled: src?.kind === "local" && packages.length > 0,
    staleTime: Infinity,
  });

/** 알림 시각(epoch ms)을 템플릿 규칙이 쓰는 YYYY-MM-DDTHH:mm 로 바꾼다. */
export function toLocalDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
