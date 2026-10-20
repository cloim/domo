const won = new Intl.NumberFormat("ko-KR");
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const formatWon = (amount: number) => won.format(amount);

/** 차트 축처럼 좁은 자리에 쓰는 짧은 금액 표기 */
export function formatWonShort(amount: number): string {
  if (amount >= 100_000_000) return `${+(amount / 100_000_000).toFixed(1)}억`;
  if (amount >= 10_000) return `${+(amount / 10_000).toFixed(amount >= 1_000_000 ? 0 : 1)}만`;
  return won.format(amount);
}

export function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date.slice(0, 10)}T00:00:00`).getDay()]!;
}

export function isWeekend(date: string): boolean {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`).getDay();
  return d === 0 || d === 6;
}

export const formatTime = (dateTime: string) => dateTime.slice(11, 16);

export function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

export function formatShortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}.${Number(d)}`;
}

/** 결제일 표시. 31은 말일이다. */
export const dayLabel = (d: number) => (d === 31 ? "말일" : `${d}일`);

/** 결제일 드롭다운 항목. 숫자로 시작해야 드롭다운에서 숫자를 눌러 바로 고를 수 있다. */
export const dayOptionLabel = (d: number) => (d === 31 ? "31일 (말일)" : `${d}일`);
