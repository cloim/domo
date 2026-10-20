import { currentYearMonth, expandEntries, monthRange, summarizeEntries } from "@domo/core";
import { useEffect, useMemo } from "react";
import { useHousehold, useTransactions } from "../lib/queries.ts";
import { DomoWidget, widgetSupported } from "../lib/widget.ts";

export function WidgetSync() {
  const month = currentYearMonth();
  const range = useMemo(() => monthRange(month), [month]);
  const household = useHousehold();
  const txs = useTransactions(range);
  useEffect(() => {
    if (!widgetSupported || !household.data || !txs.data || txs.isFetching) return;
    const balance = summarizeEntries(expandEntries(txs.data, range), household.data).balance;
    void DomoWidget.update({ month, balance, updatedAt: Math.min(txs.dataUpdatedAt, household.dataUpdatedAt) }).catch(() => {});
  }, [household.data, household.dataUpdatedAt, txs.data, txs.dataUpdatedAt, txs.isFetching, month, range]);
  return null;
}
