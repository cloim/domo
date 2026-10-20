import { billingLookupRange, cardBill, expandEntries, nowLocalDateTime, type CardBill } from "@domo/core";
import { useMemo } from "react";
import { useHousehold, useTransactions } from "./queries.ts";

/** 사용 중인 카드별 다음 결제 예정 금액. 결제 정보가 없는 카드는 빠진다. */
export function useCardBills() {
  const today = nowLocalDateTime().slice(0, 10);
  const range = useMemo(() => billingLookupRange(today), [today]);
  const household = useHousehold();
  const txs = useTransactions(range);
  const bills = useMemo(() => {
    const map = new Map<string, CardBill>();
    if (!txs.data || !household.data) return map;
    const entries = expandEntries(txs.data, range);
    for (const m of household.data.paymentMethods) {
      const bill = m.type === "card" ? cardBill(entries, m, today) : null;
      if (bill) map.set(m.id, bill);
    }
    return map;
  }, [txs.data, household.data, range, today]);
  return { bills, isPending: txs.isPending || household.isPending, isError: txs.isError };
}
