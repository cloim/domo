import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { NotifyTemplate, TransactionKind } from "@domo/core";

export interface NotifyStatus {
  listenerEnabled: boolean;
  connected: boolean;
  postAllowed: boolean;
  targetCount: number;
  templateCount: number;
}

export interface InstalledApp {
  packageName: string;
  label: string;
  system: boolean;
  launchable: boolean;
}

export interface NotifyTarget {
  packageName: string;
  label: string;
  enabled: boolean;
  removeOriginal: boolean;
}

export interface CapturedNotification {
  id: number;
  packageName: string;
  title: string;
  text: string;
  /** epoch ms */
  postedAt: number;
  matchedTemplateId: string | null;
}

/** 등록 알림을 눌렀을 때 넘어오는 값 */
export interface NotifyPrefill {
  kind: TransactionKind;
  amount: number;
  counterparty: string | null;
  memo: string | null;
  occurredAt: string;
  paymentMethodId: string | null;
  categoryId: string | null;
  templateId: string;
  sourcePackage: string;
}

interface DomoNotifyPlugin {
  getStatus(): Promise<NotifyStatus>;
  openListenerSettings(): Promise<void>;
  requestPostPermission(): Promise<{ postAllowed: boolean }>;
  listApps(): Promise<{ apps: InstalledApp[] }>;
  getAppIcons(options: { packages: string[] }): Promise<{ icons: Record<string, string> }>;
  getTargets(): Promise<{ targets: NotifyTarget[] }>;
  setTargets(options: { targets: NotifyTarget[] }): Promise<void>;
  getTemplates(): Promise<{ templates: NotifyTemplate[] }>;
  setTemplates(options: { templates: NotifyTemplate[] }): Promise<void>;
  getNotifications(options: { packageName?: string; limit?: number }): Promise<{ notifications: CapturedNotification[] }>;
  clearNotifications(options: { packageName: string }): Promise<void>;
  configureSync(options: { apiBase: string; token: string }): Promise<{ deviceId: string; deviceName: string; configVersion: number }>;
  clearSync(): Promise<void>;
  applyConfig(options: { targets: NotifyTarget[]; templates: NotifyTemplate[]; version: number }): Promise<void>;
  setConfigVersion(options: { version: number }): Promise<void>;
  syncNow(): Promise<void>;
  addListener(event: "prefill", handler: (data: NotifyPrefill) => void): Promise<PluginListenerHandle>;
}

/** 알림 연동은 안드로이드 앱에서만 쓴다. */
export const notifySupported = Capacitor.getPlatform() === "android";

export const DomoNotify = registerPlugin<DomoNotifyPlugin>("DomoNotify");

export type NotifyHealth = "running" | "permission" | "idle" | "disconnected";

/** 상단바 표시용 요약 */
export function notifyHealth(s: NotifyStatus): NotifyHealth {
  if (!s.listenerEnabled || !s.postAllowed) return "permission";
  if (s.targetCount === 0 || s.templateCount === 0) return "idle";
  return s.connected ? "running" : "disconnected";
}
