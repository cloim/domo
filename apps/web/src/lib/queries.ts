import type { Category, DateRange, MemberRole, PaymentMethod, Transaction, TransactionInput } from "@domo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.ts";

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

export const useTransactions = (range: DateRange) =>
  useQuery({
    queryKey: keys.transactions(range),
    queryFn: () => api<Transaction[]>(`/api/transactions?start=${range.start}&end=${range.end}`),
    placeholderData: (prev) => prev,
  });

export function useSaveTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TransactionInput }) =>
      api<Transaction>(id ? `/api/transactions/${id}` : "/api/transactions", { method: id ? "PATCH" : "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}

/** 설정 화면의 단순 변경 요청. 성공하면 기준 정보를 다시 받는다. */
export function useHouseholdMutation<V, R = unknown>(request: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: request, onSuccess: () => qc.invalidateQueries({ queryKey: keys.household }) });
}
