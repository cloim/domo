import type { CSSProperties } from "react";
import type { YearMonth } from "@domo/core";
import { useNavigate } from "react-router";
import { formatWon } from "../lib/format.ts";

export function InkCalendar({ month, daily }: { month: YearMonth; daily: { date: string; amount: number }[] }) {
  const navigate = useNavigate();
  const first = new Date(`${month}-01T12:00:00`).getDay();
  const max = Math.max(1, ...daily.map((d) => d.amount));
  return <section className="panel ink-calendar" aria-label="날짜별 지출 달력"><h2>지출의 농도</h2>
    <div className="calendar-grid">{["일", "월", "화", "수", "목", "금", "토"].map((d) => <span className="calendar-weekday" key={d}>{d}</span>)}
      {Array.from({ length: first }, (_, i) => <span key={`space:${i}`} />)}
      {daily.map((d) => {
        const density = d.amount ? 0.15 + 0.75 * Math.sqrt(d.amount / max) : 0;
        return <button type="button" key={d.date} className="ink-day" data-heavy={density > 0.63} data-bright={density > 0.42} style={{ "--ink-density": density } as CSSProperties} title={`${d.date}, ${formatWon(d.amount)}원`} aria-label={`${d.date}, 지출 ${formatWon(d.amount)}원, 기록 보기`} onClick={() => navigate(`/records?m=${month}&tab=expense&day=${d.date}`)}><span>{Number(d.date.slice(8))}</span><small>{d.amount ? formatWon(d.amount) : ""}</small></button>;
      })}
    </div><div className="ink-legend"><span>지출 적음</span>{[0, 0.2, 0.45, 0.7, 0.9].map((n) => <i key={n} style={{ "--ink-density": n } as CSSProperties} />)}<span>많음</span></div>
  </section>;
}
