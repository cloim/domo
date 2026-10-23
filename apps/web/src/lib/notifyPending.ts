import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "./api.ts";
import { DomoNotify, notifySupported } from "./notify.ts";
import type { EntryPrefill } from "../pages/records/EntryForm.tsx";

export interface PendingRegistration {
  id: string;
  deviceId: string;
  eventKey: string;
  deviceName?: string;
  packageName: string;
  postedAt: number;
  prefill: EntryPrefill;
}
export const pendingKey = ["notify", "pending"] as const;

export async function loadPendingRegistrations(): Promise<PendingRegistration[]> {
  if (notifySupported) await DomoNotify.syncNow();
  const local = notifySupported ? (await DomoNotify.getRegistrations()).items : [];
  let remote: PendingRegistration[];
  try { remote = await api<PendingRegistration[]>("/api/notify/registrations"); }
  catch (error) {
    if (notifySupported && local.length) return local.sort((a, b) => b.postedAt - a.postedAt || b.id.localeCompare(a.id));
    throw error;
  }
  const all = new Map(remote.map((item) => [item.id, item]));
  for (const item of local) if (!all.has(item.id)) all.set(item.id, item);
  return [...all.values()].sort((a, b) => b.postedAt - a.postedAt || b.id.localeCompare(a.id));
}
export const usePendingRegistrations = () => useQuery({
  queryKey: pendingKey, queryFn: loadPendingRegistrations, refetchInterval: 15_000,
});
export async function finishPendingRegistration(qc: QueryClient, item: PendingRegistration, status: "registered" | "excluded") {
  await qc.cancelQueries({ queryKey: pendingKey });
  qc.setQueryData<PendingRegistration[]>(pendingKey, (items) => items?.filter((r) => r.id !== item.id));
  if (notifySupported) await DomoNotify.resolveRegistration({ eventKey: item.eventKey, status }).catch(() => {});
  void qc.invalidateQueries({ queryKey: pendingKey });
}
