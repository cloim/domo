import { NOTIFY_KEEP_DAYS, notifyAppsSchema, notifyDeviceConfigSchema, notifyUploadSchema } from "@domo/core";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Db } from "../db/client.ts";
import { notifyDevices, notifyNotifications } from "../db/schema.ts";
import { HttpError, parse, userIdOf } from "../http.ts";
import { decryptSecret, encryptSecret } from "../secret.ts";

/** 30일 지난 알림 이력을 지운다. 서버의 주기 작업에서 부른다. */
export async function pruneNotifyHistory(db: Db) {
  await db.delete(notifyNotifications).where(lt(notifyNotifications.postedAt, new Date(Date.now() - NOTIFY_KEEP_DAYS * 86_400_000)));
}

const idParam = z.object({ id: z.string().uuid() });

export async function notifyRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }) {
  /** 내 계정의 기기만 다룬다. */
  async function myDevice(req: FastifyRequest) {
    const { id } = parse(idParam, req.params);
    const [device] = await db.select().from(notifyDevices).where(and(eq(notifyDevices.id, id), eq(notifyDevices.userId, userIdOf(req))));
    if (!device) throw new HttpError(404, "기기를 찾을 수 없습니다. 휴대폰 앱을 한 번 열어 주세요.");
    return device;
  }

  /** 휴대폰이 앱을 열 때 자기를 등록한다. 다른 계정의 기기 ID는 받지 않는다. */
  app.put("/api/notify/devices/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(100) }), req.body);
    const userId = userIdOf(req);
    const [existing] = await db.select().from(notifyDevices).where(eq(notifyDevices.id, id));
    if (existing && existing.userId !== userId) throw new HttpError(409, "다른 계정에 등록된 기기입니다. 앱을 다시 설치해 주세요.");
    const [row] = await db
      .insert(notifyDevices)
      .values({ id, userId, name })
      .onConflictDoUpdate({ target: notifyDevices.id, set: { name, lastSeenAt: new Date() } })
      .returning({ configVersion: notifyDevices.configVersion });
    return { configVersion: row!.configVersion };
  });

  app.get("/api/notify/devices", async (req) => {
    const rows = await db.select().from(notifyDevices).where(eq(notifyDevices.userId, userIdOf(req))).orderBy(desc(notifyDevices.lastSeenAt));
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      lastSeenAt: d.lastSeenAt,
      configVersion: d.configVersion,
      targetCount: (d.targets as unknown[]).length,
      templateCount: (d.templates as unknown[]).length,
    }));
  });

  app.get("/api/notify/devices/:id/config", async (req) => {
    const device = await myDevice(req);
    return { targets: device.targets, templates: device.templates, version: device.configVersion };
  });

  /** 대상 앱과 템플릿 사본을 바꾸고 버전을 올린다. 마지막 저장이 이긴다. */
  app.put("/api/notify/devices/:id/config", async (req) => {
    const device = await myDevice(req);
    const input = parse(notifyDeviceConfigSchema, req.body);
    const [row] = await db
      .update(notifyDevices)
      .set({ targets: input.targets, templates: input.templates, configVersion: sql`${notifyDevices.configVersion} + 1` })
      .where(eq(notifyDevices.id, device.id))
      .returning({ version: notifyDevices.configVersion });
    return { version: row!.version };
  });

  app.put("/api/notify/devices/:id/apps", async (req) => {
    const device = await myDevice(req);
    const { apps } = parse(notifyAppsSchema, req.body);
    await db.update(notifyDevices).set({ apps }).where(eq(notifyDevices.id, device.id));
    return { ok: true };
  });

  app.get("/api/notify/devices/:id/apps", async (req) => (await myDevice(req)).apps);

  /** 휴대폰의 알림 감시 서비스가 받은 알림을 올린다. 응답의 configVersion 으로 PC에서 바뀐 설정을 알아챈다. */
  app.post("/api/notify/devices/:id/notifications", async (req) => {
    const device = await myDevice(req);
    const { items } = parse(notifyUploadSchema, req.body);
    const keepFrom = Date.now() - NOTIFY_KEEP_DAYS * 86_400_000;
    const fresh = items.filter((i) => i.postedAt >= keepFrom);
    if (fresh.length > 0) {
      await db
        .insert(notifyNotifications)
        .values(
          fresh.map((i) => ({
            deviceId: device.id,
            localId: i.localId,
            packageName: i.packageName,
            titleEnc: encryptSecret(config, i.title),
            textEnc: encryptSecret(config, i.text),
            postedAt: new Date(i.postedAt),
            matchedTemplateId: i.matchedTemplateId,
          })),
        )
        .onConflictDoNothing();
    }
    await db.update(notifyDevices).set({ lastSeenAt: new Date() }).where(eq(notifyDevices.id, device.id));
    return { accepted: items.length, configVersion: device.configVersion };
  });

  app.get("/api/notify/devices/:id/notifications", async (req) => {
    const device = await myDevice(req);
    const q = parse(z.object({ packageName: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    const where = q.packageName ? and(eq(notifyNotifications.deviceId, device.id), eq(notifyNotifications.packageName, q.packageName)) : eq(notifyNotifications.deviceId, device.id);
    const rows = await db.select().from(notifyNotifications).where(where).orderBy(desc(notifyNotifications.postedAt)).limit(q.limit);
    return rows.map((r) => ({
      id: r.localId,
      packageName: r.packageName,
      title: decryptSecret(config, r.titleEnc),
      text: decryptSecret(config, r.textEnc),
      postedAt: r.postedAt.getTime(),
      matchedTemplateId: r.matchedTemplateId,
    }));
  });

  app.delete("/api/notify/devices/:id/notifications", async (req) => {
    const device = await myDevice(req);
    const { packageName } = parse(z.object({ packageName: z.string().min(1).max(200) }), req.query);
    await db.delete(notifyNotifications).where(and(eq(notifyNotifications.deviceId, device.id), eq(notifyNotifications.packageName, packageName)));
    return { ok: true };
  });
}
