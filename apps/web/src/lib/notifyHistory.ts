import { applyNotifyTemplate, type NotifyTemplate } from "@domo/core";
import type { CapturedNotification, NotifyPrefill } from "./notify.ts";

/** 현재 활성화된 같은 앱의 패턴을 수신 때와 같은 순서로 비교한다. */
export function matchNotificationHistory(notification: CapturedNotification, templates: NotifyTemplate[], postedAt: string): NotifyPrefill | null {
  for (const template of templates) {
    if (!template.enabled || template.packageName !== notification.packageName) continue;
    const match = applyNotifyTemplate(template, notification.title, notification.text, postedAt, notification);
    if (match) return { ...match, paymentMethodId: template.paymentMethodId, categoryId: template.categoryId, templateId: template.id, sourcePackage: notification.packageName };
  }
  return null;
}
