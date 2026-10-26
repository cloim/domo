import type { Budget, RecurringExpense, Transaction, YearMonth } from "@domo/core";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

export const useAllTransactions = () => useQuery({ queryKey: ["search"], queryFn: () => api<Transaction[]>("/api/transactions/all"), staleTime: 60_000 });
export const useBudgets = (month: YearMonth) => useQuery({ queryKey: ["budgets", month], queryFn: () => api<Budget[]>(`/api/budgets?month=${month}`) });
export const useRecurring = () => useQuery({ queryKey: ["recurring"], queryFn: () => api<RecurringExpense[]>("/api/recurring") });
export interface FamilyData {
  records: (Transaction & { createdAt: string })[];
  comments: { id: string; transactionId: string; memberId: string; body: string; createdAt: string }[];
  reactions: { transactionId: string; memberId: string; reaction: "like" | "thanks" }[];
  alerts: { id: string; month: string; categoryId: string; amount: number; spent: number; createdAt: string }[];
}
export const useFamily = (month: YearMonth) => useQuery({ queryKey: ["family", month], queryFn: () => api<FamilyData>(`/api/family?month=${month}`), refetchInterval: 30_000 });
