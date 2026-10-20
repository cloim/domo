// 가계부의 날짜는 가족이 사는 지역의 벽시계 시각(YYYY-MM-DD, YYYY-MM-DDTHH:mm)을 그대로 쓴다.

export type YearMonth = `${number}-${number}`;

export interface DateRange {
  /** 포함 시작일 YYYY-MM-DD */
  start: string;
  /** 포함 종료일 YYYY-MM-DD */
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDate(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) throw new Error(`날짜 형식 오류: ${date}`);
  return { year: y, month: m, day: d };
}

/** 월 단위로 더하고, 대상 월에 같은 날이 없으면 말일로 맞춘다(1/31 + 1개월 = 2/28). */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = parseDate(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const datePart = toDateString(y, m, Math.min(day, daysInMonth(y, m)));
  return date.length > 10 ? datePart + date.slice(10) : datePart;
}

export function monthOf(date: string): YearMonth {
  return date.slice(0, 7) as YearMonth;
}

export function shiftMonth(ym: YearMonth, months: number): YearMonth {
  return monthOf(addMonths(`${ym}-01`, months));
}

export function monthRange(ym: YearMonth): DateRange {
  const { year, month } = parseDate(`${ym}-01`);
  return { start: `${ym}-01`, end: toDateString(year, month, daysInMonth(year, month)) };
}

export function isWithin(date: string, range: DateRange): boolean {
  const d = date.slice(0, 10);
  return d >= range.start && d <= range.end;
}

/** 범위의 모든 날짜를 오름차순으로 돌려준다. */
export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  const cursor = new Date(`${range.start}T00:00:00Z`);
  const last = new Date(`${range.end}T00:00:00Z`);
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function currentYearMonth(now = new Date()): YearMonth {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}` as YearMonth;
}

export function nowLocalDateTime(now = new Date()): string {
  return `${toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
