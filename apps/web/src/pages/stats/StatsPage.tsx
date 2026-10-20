import {
  computeStats,
  currentYearMonth,
  expandEntries,
  monthRange,
  nowLocalDateTime,
  shiftMonth,
  type CategoryStat,
  type DateRange,
  type PeriodStats,
  type StatSlice,
  type TransactionKind,
  type YearMonth,
} from "@domo/core";
import type { ChartOptions, TooltipItem } from "chart.js";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { useOutletContext } from "react-router";
import { TopBar } from "../../components/AppShell.tsx";
import { MonthSwitch } from "../../components/MonthSwitch.tsx";
import { formatShortDate, formatWon, formatWonShort } from "../../lib/format.ts";
import { useHousehold, useTransactions, type Me } from "../../lib/queries.ts";
import { baseOptions, MAX_SLICES, SERIES, token } from "./charts.ts";

type Mode = "month" | "range";

/** 기간이 길면 일별 막대가 너무 가늘어져 월별로 묶는다. */
const DAILY_LIMIT_DAYS = 62;

export function StatsPage() {
  const me = useOutletContext<Me>();
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState<YearMonth>(currentYearMonth());
  const [custom, setCustom] = useState<DateRange>(() => ({ start: monthRange(shiftMonth(currentYearMonth(), -2)).start, end: monthRange(currentYearMonth()).end }));
  const range = useMemo(() => (mode === "month" ? monthRange(month) : custom), [mode, month, custom]);

  const household = useHousehold();
  const txs = useTransactions(range);
  const stats = useMemo(() => {
    if (!txs.data || !household.data) return null;
    return computeStats(expandEntries(txs.data, range), kind, range, household.data);
  }, [txs.data, household.data, kind, range]);

  // 진행 중인 기간은 오늘까지 지난 날만 평균에 넣는다.
  const today = nowLocalDateTime().slice(0, 10);
  const days = stats?.daily.filter((d) => d.date <= today).length ?? 0;

  return (
    <>
      <TopBar title="통계" me={me} />
      <div className="content">
        <div className="page">
          <div className="stats-controls">
            <div className="segmented" role="group" aria-label="종류">
              <button type="button" aria-pressed={kind === "expense"} onClick={() => setKind("expense")}>
                지출
              </button>
              <button type="button" aria-pressed={kind === "income"} onClick={() => setKind("income")}>
                수입
              </button>
            </div>
            <div className="segmented" role="group" aria-label="조회 단위">
              <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}>
                월
              </button>
              <button type="button" aria-pressed={mode === "range"} onClick={() => setMode("range")}>
                기간
              </button>
            </div>
            {mode === "month" ? (
              <MonthSwitch value={month} onChange={setMonth} />
            ) : (
              <div className="range-inputs">
                <input
                  type="date"
                  className="input"
                  aria-label="시작일"
                  value={custom.start}
                  max={custom.end}
                  onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))}
                />
                <span aria-hidden="true">~</span>
                <input
                  type="date"
                  className="input"
                  aria-label="종료일"
                  value={custom.end}
                  min={custom.start}
                  onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))}
                />
              </div>
            )}
          </div>

          {!stats ? (
            txs.isError || household.isError ? (
              <div className="empty" role="alert">
                <strong>통계를 불러오지 못했어요</strong>
                <button type="button" className="btn btn-ghost" onClick={() => void txs.refetch()}>
                  다시 시도
                </button>
              </div>
            ) : (
              <StatsSkeleton />
            )
          ) : (
            <>
              <div className="stats-headline">
                <span className="stats-total num">
                  {formatWon(stats.total)}
                  <small>원</small>
                </span>
                <span className="stats-facts">
                  <span>
                    <b className="num">{stats.count}</b>건
                  </span>
                  <span>
                    하루 평균 <b className="num">{formatWon(Math.round(stats.total / Math.max(days, 1)))}</b>원
                  </span>
                </span>
              </div>
              {stats.count === 0 ? (
                <div className="empty">
                  <strong>이 기간의 {kind === "expense" ? "지출" : "수입"} 기록이 없어요</strong>
                  <span>기간을 바꾸거나 입출기록에서 기록을 추가해 주세요.</span>
                </div>
              ) : (
                <div className="stats-grid">
                  <CategoryPanel stats={stats} />
                  <TimelinePanel stats={stats} />
                  <BarPanel title="구성원별" slices={stats.byMember} useOwnColor />
                  {kind === "expense" && <BarPanel title="지출수단별" slices={stats.byPaymentMethod} />}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function foldSlices(slices: CategoryStat[], total: number): (CategoryStat & { color: string })[] {
  const head = slices.slice(0, MAX_SLICES - 1);
  const tail = slices.slice(MAX_SLICES - 1);
  const colored = head.map((s, i) => ({ ...s, color: token(SERIES[i]!) }));
  if (tail.length === 1) return [...colored, { ...tail[0]!, color: token(SERIES[MAX_SLICES - 1]!) }];
  if (tail.length > 1) {
    const amount = tail.reduce((s, t) => s + t.amount, 0);
    return [...colored, { id: "__other", label: `기타 ${tail.length}개`, amount, share: amount / total, color: token("--series-other"), children: tail }];
  }
  return colored;
}

function CategoryPanel({ stats }: { stats: PeriodStats }) {
  const [open, setOpen] = useState<string | null>(null);
  const slices = foldSlices(stats.byCategory, stats.total);
  const options: ChartOptions<"doughnut"> = {
    ...baseOptions(),
    cutout: "68%",
    plugins: {
      ...baseOptions().plugins,
      tooltip: { ...baseOptions().plugins.tooltip, callbacks: { label: (c: TooltipItem<"doughnut">) => ` ${c.label} ${formatWon(c.parsed)}원` } },
    },
  };
  return (
    <section className="panel" aria-labelledby="stat-cat">
      <h2 id="stat-cat">분류별</h2>
      <div className="category-viz">
        <div className="chart-box">
          <Doughnut
            data={{
              labels: slices.map((s) => s.label),
              datasets: [{ data: slices.map((s) => s.amount), backgroundColor: slices.map((s) => s.color), borderColor: token("--surface"), borderWidth: 2, hoverOffset: 4 }],
            }}
            options={options}
            aria-label="분류별 비중 도넛 차트"
          />
        </div>
        <ul className="rank-list">
          {slices.map((s) => (
            <li key={s.id}>
              <button type="button" className="rank-row" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className="dot" style={{ background: s.color }} aria-hidden="true" />
                <span className="rank-name">{s.label}</span>
                <span className="rank-share num">{Math.round(s.share * 100)}%</span>
                <span className="rank-amount num">{formatWon(s.amount)}</span>
                {open === s.id ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
              </button>
              {open === s.id && (
                <ul className="rank-children">
                  {s.children.map((c) => (
                    <li key={c.id} className="rank-row">
                      <span className="rank-name">{c.label}</span>
                      <span className="rank-share num">{Math.round(c.share * 100)}%</span>
                      <span className="rank-amount num">{formatWon(c.amount)}</span>
                      <span style={{ width: 16 }} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TimelinePanel({ stats }: { stats: PeriodStats }) {
  const monthly = stats.daily.length > DAILY_LIMIT_DAYS;
  const points = useMemo(() => {
    if (!monthly) return stats.daily.map((d) => ({ label: formatShortDate(d.date), amount: d.amount }));
    const byMonth = new Map<string, number>();
    for (const d of stats.daily) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.amount);
    return [...byMonth].map(([m, amount]) => ({ label: `${Number(m.slice(5))}월`, amount }));
  }, [stats.daily, monthly]);
  const base = baseOptions();
  const options: ChartOptions<"bar"> = {
    ...base,
    plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, displayColors: false, callbacks: { label: (c: TooltipItem<"bar">) => `${formatWon(c.parsed.y ?? 0)}원` } } },
    scales: {
      x: { grid: { display: false }, border: { color: token("--line") }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: token("--line") }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (v) => formatWonShort(Number(v)) } },
    },
  };
  return (
    <section className="panel" aria-labelledby="stat-time">
      <h2 id="stat-time">{monthly ? "월별" : "일별"}</h2>
      <div className="chart-box">
        <Bar
          data={{ labels: points.map((p) => p.label), datasets: [{ data: points.map((p) => p.amount), backgroundColor: token("--accent"), borderRadius: 4, maxBarThickness: 22 }] }}
          options={options}
          aria-label={`${monthly ? "월별" : "일별"} 금액 막대 차트`}
        />
      </div>
    </section>
  );
}

function BarPanel({ title, slices, useOwnColor }: { title: string; slices: StatSlice[]; useOwnColor?: boolean }) {
  const base = baseOptions();
  const options: ChartOptions<"bar"> = {
    ...base,
    indexAxis: "y",
    plugins: {
      ...base.plugins,
      tooltip: { ...base.plugins.tooltip, displayColors: false, callbacks: { label: (c: TooltipItem<"bar">) => `${formatWon(c.parsed.x ?? 0)}원 (${Math.round((slices[c.dataIndex]?.share ?? 0) * 100)}%)` } },
    },
    scales: {
      x: { grid: { color: token("--line") }, border: { display: false }, ticks: { maxTicksLimit: 4, callback: (v) => formatWonShort(Number(v)) } },
      y: { grid: { display: false }, border: { color: token("--line") }, ticks: { color: token("--ink-2") } },
    },
  };
  const height = Math.max(120, slices.length * 44 + 30);
  return (
    <section className="panel" aria-labelledby={`stat-${title}`}>
      <h2 id={`stat-${title}`}>{title}</h2>
      <div className="chart-box" style={{ height }}>
        <Bar
          data={{
            labels: slices.map((s) => s.label),
            datasets: [{ data: slices.map((s) => s.amount), backgroundColor: slices.map((s) => (useOwnColor && s.color) || token("--series-2")), borderRadius: 4, barThickness: 20 }],
          }}
          options={options}
          aria-label={`${title} 금액 막대 차트`}
        />
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {slices.map((s) => (
            <tr key={s.id}>
              <th>{s.label}</th>
              <td>{formatWon(s.amount)}원</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      <span className="skeleton" style={{ display: "block", width: 220, height: 40, margin: "22px 0 18px" }} />
      <div className="stats-grid">
        {[0, 1].map((i) => (
          <div key={i} className="panel">
            <span className="skeleton" style={{ display: "block", height: 220 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
