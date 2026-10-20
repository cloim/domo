import { currentYearMonth, shiftMonth, type YearMonth } from "@domo/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { formatYearMonth } from "../lib/format.ts";

/** 이전과 다음 달 이동, 제목을 누르면 달력에서 바로 고른다. */
export function MonthSwitch({ value, onChange }: { value: YearMonth; onChange: (ym: YearMonth) => void }) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const isCurrent = value === currentYearMonth();
  return (
    <div className="month-switch">
      <button type="button" className="icon-btn" aria-label="이전 달" onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <button type="button" className="month-label" onClick={() => pickerRef.current?.showPicker?.()} aria-label={`${formatYearMonth(value)}, 월 선택`}>
        {formatYearMonth(value)}
      </button>
      <input
        ref={pickerRef}
        type="month"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value as YearMonth)}
      />
      <button type="button" className="icon-btn" aria-label="다음 달" onClick={() => onChange(shiftMonth(value, 1))}>
        <ChevronRight size={22} aria-hidden="true" />
      </button>
      {!isCurrent && (
        <button type="button" className="btn btn-ghost btn-sm today-btn" onClick={() => onChange(currentYearMonth())}>
          이번 달
        </button>
      )}
    </div>
  );
}
