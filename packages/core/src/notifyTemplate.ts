import type { TransactionKind } from "./schemas.ts";

/** 기기에 저장하는 알림 템플릿. 안드로이드 매처(NotifyMatcher.java)와 같은 규칙을 쓴다. */
export interface NotifyTemplate {
  id: string;
  name: string;
  packageName: string;
  kind: TransactionKind;
  /** `제목 + 줄바꿈 + 본문`에 적용하는 정규식. 이름 그룹 amount 필수 */
  pattern: string;
  paymentMethodId: string | null;
  categoryId: string | null;
  enabled: boolean;
  sampleTitle: string;
  sampleText: string;
}

export interface NotifyMatch {
  kind: TransactionKind;
  amount: number;
  counterparty: string | null;
  memo: string | null;
  occurredAt: string;
}

export const NOTIFY_GROUPS = ["amount", "counterparty", "memo", "month", "day", "hour", "minute"] as const;

export function notificationBody(title: string, text: string): string {
  return `${title}\n${text}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 템플릿을 알림에 적용한다. 맞지 않거나 금액이 없으면 null.
 * 월, 일이 있으면 알림 시각의 연도를 쓰고, 그 날짜가 알림 시각보다 미래면 작년으로 본다.
 */
export function applyNotifyTemplate(
  template: Pick<NotifyTemplate, "pattern" | "kind">,
  title: string,
  text: string,
  postedAt: string,
): NotifyMatch | null {
  let re: RegExp;
  try {
    re = new RegExp(template.pattern);
  } catch {
    return null;
  }
  const groups = re.exec(notificationBody(title, text))?.groups;
  if (!groups) return null;
  const amount = Number((groups.amount ?? "").replace(/[^\d]/g, ""));
  if (!amount) return null;

  const clean = (v: string | undefined) => v?.trim() || null;
  let date = postedAt.slice(0, 10);
  const month = Number(groups.month);
  const day = Number(groups.day);
  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    const year = Number(postedAt.slice(0, 4));
    date = `${year}-${pad(month)}-${pad(day)}`;
    if (date > postedAt.slice(0, 10)) date = `${year - 1}-${pad(month)}-${pad(day)}`;
  }
  const hour = Number(groups.hour);
  const minute = Number(groups.minute);
  const time = groups.hour !== undefined && hour >= 0 && hour <= 23 ? `${pad(hour)}:${pad(minute >= 0 && minute <= 59 ? minute : 0)}` : postedAt.slice(11, 16);

  return { kind: template.kind, amount, counterparty: clean(groups.counterparty), memo: clean(groups.memo), occurredAt: `${date}T${time}` };
}

/** 정규식이 문법상 맞고 amount 그룹을 가졌는지 확인한다. 문제가 없으면 null */
export function validateNotifyPattern(pattern: string): string | null {
  try {
    new RegExp(pattern);
  } catch (err) {
    return `정규식 오류: ${(err as Error).message}`;
  }
  if (!pattern.includes("(?<amount>")) return "금액을 담는 (?<amount>...) 그룹이 필요합니다.";
  return null;
}
