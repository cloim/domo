import { z } from "zod";
import { transactionKinds } from "./schemas.ts";

/** 기기별 알림 연동 설정. 기기와 서버가 같은 모양을 쓴다. */
export const notifyTargetSchema = z.object({
  packageName: z.string().min(1).max(200),
  label: z.string().max(200),
  enabled: z.boolean(),
  removeOriginal: z.boolean(),
});

export const notifyTemplateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(100),
  packageName: z.string().max(200),
  kind: z.enum(transactionKinds),
  pattern: z.string().max(2000),
  paymentMethodId: z.string().uuid().nullable(),
  categoryId: z.string().uuid().nullable(),
  enabled: z.boolean(),
  sampleTitle: z.string().max(500),
  sampleText: z.string().max(4000),
});

export const notifyDeviceConfigSchema = z.object({
  targets: z.array(notifyTargetSchema).max(200),
  templates: z.array(notifyTemplateSchema).max(500),
});
export type NotifyDeviceConfig = z.infer<typeof notifyDeviceConfigSchema>;

export const notifyAppsSchema = z.object({
  apps: z.array(z.object({ packageName: z.string().min(1).max(200), label: z.string().max(200), launchable: z.boolean() })).max(3000),
});

/** 기기가 올리는 알림. localId 는 기기 DB의 번호라 같은 알림을 두 번 올려도 한 번만 저장된다. */
export const notifyUploadSchema = z.object({
  items: z
    .array(
      z.object({
        localId: z.number().int().nonnegative(),
        packageName: z.string().min(1).max(200),
        title: z.string().max(500),
        text: z.string().max(4000),
        postedAt: z.number().int().positive(),
        matchedTemplateId: z.string().max(64).nullable(),
      }),
    )
    .max(200),
});

/** 서버에 알림 이력을 두는 기간 */
export const NOTIFY_KEEP_DAYS = 30;
