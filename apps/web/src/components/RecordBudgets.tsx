import { budgetProgress, type Transaction, type YearMonth } from "@domo/core";
import { Link } from "react-router";
import { useBudgets } from "../lib/family.ts";
import type { HouseholdData } from "../lib/queries.ts";

export function RecordBudgets({ month, transactions, household }: { month: YearMonth; transactions: Transaction[]; household: HouseholdData }) {
  const budgets = useBudgets(month);
  const progress = budgetProgress(budgets.data ?? [], transactions, household.categories, household.paymentMethods, month).sort((a, b) => b.ratio - a.ratio);
  if (!progress.length) return null;
  return <Link className="record-budgets" to={`/plan?m=${month}`} aria-label="생활비 계획에서 예산 보기">{progress.slice(0, 3).map((b) => <span key={b.categoryId}><span>{household.categories.find((c) => c.id === b.categoryId)?.name} <b className={b.ratio >= 0.8 ? "budget-warning" : ""}>{Math.round(b.ratio * 100)}%</b></span><progress value={Math.min(b.spent, b.amount)} max={b.amount} aria-label="예산 사용률" /></span>)}</Link>;
}
