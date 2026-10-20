import type { NotifyTemplate } from "@domo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DomoNotify, type NotifyTarget } from "../../../lib/notify.ts";

export const notifyKeys = {
  status: ["notify", "status"] as const,
  targets: ["notify", "targets"] as const,
  templates: ["notify", "templates"] as const,
  notifications: (pkg: string) => ["notify", "notifications", pkg] as const,
  apps: ["notify", "apps"] as const,
  icons: (pkgs: string[]) => ["notify", "icons", ...pkgs] as const,
};

export const useNotifyStatus = () => useQuery({ queryKey: notifyKeys.status, queryFn: () => DomoNotify.getStatus(), refetchInterval: 30_000 });

export const useTargets = () => useQuery({ queryKey: notifyKeys.targets, queryFn: async () => (await DomoNotify.getTargets()).targets });

export const useTemplates = () => useQuery({ queryKey: notifyKeys.templates, queryFn: async () => (await DomoNotify.getTemplates()).templates });

export const useAppIcons = (packages: string[]) =>
  useQuery({
    queryKey: notifyKeys.icons(packages),
    queryFn: async () => (await DomoNotify.getAppIcons({ packages })).icons,
    enabled: packages.length > 0,
    staleTime: Infinity,
  });

export function useSaveTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targets: NotifyTarget[]) => DomoNotify.setTargets({ targets }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: notifyKeys.targets }), qc.invalidateQueries({ queryKey: notifyKeys.status })]),
  });
}

export function useSaveTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templates: NotifyTemplate[]) => DomoNotify.setTemplates({ templates }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: notifyKeys.templates }), qc.invalidateQueries({ queryKey: notifyKeys.status })]),
  });
}

/** 알림 시각(epoch ms)을 템플릿 규칙이 쓰는 YYYY-MM-DDTHH:mm 로 바꾼다. */
export function toLocalDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
