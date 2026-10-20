import { ArcElement, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip } from "chart.js";

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/** CSS 토큰을 읽어 차트 색을 테마와 맞춘다. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const SERIES = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6"];
/** 범주는 6개까지 고정 순서로 색을 주고 나머지는 '기타'로 묶는다. */
export const MAX_SLICES = SERIES.length;

export function baseOptions() {
  Chart.defaults.font.family = token("--font-body") || "sans-serif";
  Chart.defaults.color = token("--ink-3");
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: token("--ink"),
        titleColor: token("--bg"),
        bodyColor: token("--bg"),
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4,
      },
    },
  };
}
