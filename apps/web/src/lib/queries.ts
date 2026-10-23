import { addMonths, monthRange, shiftMonth, type YearMonth, type Category, type DateRange, type MemberRole, type PaymentMethod, type Transaction, type TransactionInput } from "@domo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, session } from "./api.ts";

export interface Me {
  user: { id: string; email: string; name: string; avatarUrl: string | null };
  member: { id: string; role: MemberRole; householdId: string } | null;
}

export interface HouseholdMember {
  id: string;
  userId: string;
  role: MemberRole;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  email: string;
}

export interface HouseholdData {
  household: { id: string; name: string };
  me: { memberId: string; role: MemberRole };
  members: HouseholdMember[];
  paymentMethods: PaymentMethod[];
  categories: Category[];
}

export const keys = {
  me: ["me"] as const,
  household: ["household"] as const,
  transactions: (range: DateRange) => ["transactions", range.start, range.end] as const,
  invites: ["invites"] as const,
  recurring: ["recurring"] as const,
};

export const useMe = (enabled: boolean) => useQuery({ queryKey: keys.me, queryFn: () => api<Me>("/api/me"), enabled, staleTime: 60_000 });

export const useHousehold = () => useQuery({ queryKey: keys.household, queryFn: () => api<HouseholdData>("/api/household"), staleTime: 60_000 });

export function useTransactions(range: DateRange) {
  const qc = useQueryClient();
  useEffect(() => {
    const month = range.start.slice(0, 7) as YearMonth;
    if (range.start !== monthRange(month).start || range.end !== monthRange(month).end) return;
    for (const offset of [-1, 1]) {
      const neighbor = monthRange(shiftMonth(month, offset));
      void qc.prefetchQuery({ queryKey: keys.transactions(neighbor), queryFn: () => api<Transaction[]>(`/api/transactions?start=${neighbor.start}&end=${neighbor.end}`), staleTime: 60_000 });
    }
  }, [qc, range.start, range.end]);
  return useQuery({
    queryKey: keys.transactions(range),
    queryFn: () => api<Transaction[]>(`/api/transactions?start=${range.start}&end=${range.end}`),
    staleTime: 60_000,
  });
}

function overlaps(t: Transaction, key: readonly unknown[]) {
  return t.occurredAt.slice(0, 10) <= String(key[2]) && addMonths(t.occurredAt, t.installmentMonths - 1).slice(0, 10) >= String(key[1]);
}

export interface CounterpartySuggestion {
  counterparty: string; kind: "expense" | "income"; categoryId: string; paymentMethodId: string | null; amount: number;
}
export const useSuggestions = () => useQuery({ queryKey: ["suggestions"], queryFn: () => api<CounterpartySuggestion[]>("/api/transactions/suggestions"), staleTime: 60_000 });

export function useSaveTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["ledger-write"],
    networkMode: "always",
    mutationFn: ({ id, input, pendingId }: { id?: string; input: TransactionInput; pendingId?: string }) =>
      api<Transaction>(id ? `/api/transactions/${id}` : "/api/transactions", { method: id ? "PATCH" : "POST", body: { ...input, ...(pendingId ? { pendingId } : {}) } }),
    onMutate: async ({ id, input }) => {
      const identity = session.get();
      await qc.cancelQueries({ queryKey: ["transactions"] });
      if (identity !== session.get()) throw new Error("계정이 변경되었습니다. 다시 시도해 주세요.");
      const snapshots = qc.getQueriesData<Transaction[]>({ queryKey: ["transactions"] });
      const previous = snapshots.flatMap(([, rows]) => rows ?? []).find((t) => t.id === id);
      const optimistic: Transaction = { ...input, id: id ?? crypto.randomUUID(), memberId: previous?.memberId ?? qc.getQueryData<HouseholdData>(keys.household)?.me.memberId ?? "", recurringId: previous?.recurringId, settlementMethodId: previous?.settlementMethodId };
      for (const [key, rows] of snapshots) {
        if (!rows) continue;
        qc.setQueryData(key, [...rows.filter((t) => t.id !== optimistic.id), ...(overlaps(optimistic, key) ? [optimistic] : [])]);
      }
      return { optimistic, previous, identity };
    },
    onError: (_error, _vars, ctx) => {
      if (!ctx || ctx.identity !== session.get()) return;
      for (const [key, rows] of qc.getQueriesData<Transaction[]>({ queryKey: ["transactions"] })) {
        if (rows) qc.setQueryData(key, [...rows.filter((t) => t.id !== ctx.optimistic.id), ...(ctx.previous && overlaps(ctx.previous, key) ? [ctx.previous] : [])]);
      }
    },
    onSuccess: (saved, _vars, ctx) => {
      if (!ctx || ctx.identity !== session.get()) return;
      for (const [key, rows] of qc.getQueriesData<Transaction[]>({ queryKey: ["transactions"] })) {
        if (rows) qc.setQueryData(key, [...rows.filter((t) => t.id !== saved.id && t.id !== ctx?.optimistic.id), ...(overlaps(saved, key) ? [saved] : [])]);
      }
      void api("/api/budgets/check", { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["family"] })).catch(() => {});
    },
    onSettled: (_data, _err, _vars, ctx) => {
      if (!ctx || ctx.identity !== session.get()) return;
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "transactions" && !!ctx && (overlaps(ctx.optimistic, q.queryKey) || !!ctx.previous && overlaps(ctx.previous, q.queryKey)) });
      for (const key of ["suggestions", "family", "budgets", "search"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["ledger-write"],
    networkMode: "always",
    mutationFn: (id: string) => api(`/api/transactions/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const identity = session.get();
      await qc.cancelQueries({ queryKey: ["transactions"] });
      if (identity !== session.get()) throw new Error("계정이 변경되었습니다. 다시 시도해 주세요.");
      const previous = qc.getQueriesData<Transaction[]>({ queryKey: ["transactions"] }).flatMap(([, rows]) => rows ?? []).find((t) => t.id === id);
      qc.setQueriesData<Transaction[]>({ queryKey: ["transactions"] }, (rows) => rows?.filter((t) => t.id !== id));
      return { previous, identity };
    },
    onError: (_error, _id, ctx) => {
      if (!ctx?.previous || ctx.identity !== session.get()) return;
      for (const [key, rows] of qc.getQueriesData<Transaction[]>({ queryKey: ["transactions"] })) {
        if (rows && overlaps(ctx.previous, key)) qc.setQueryData(key, [...rows.filter((t) => t.id !== ctx.previous!.id), ctx.previous]);
      }
    },
    onSettled: (_data, _err, _id, ctx) => {
      if (!ctx || ctx.identity !== session.get()) return;
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "transactions" && !!ctx?.previous && overlaps(ctx.previous, q.queryKey) });
      for (const key of ["suggestions", "family", "budgets", "search"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** 설정 화면의 단순 변경 요청. 성공하면 기준 정보를 다시 받는다. */
export function useHouseholdMutation<V, R = unknown>(request: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: request, onSuccess: () => qc.invalidateQueries({ queryKey: keys.household }) });
}
