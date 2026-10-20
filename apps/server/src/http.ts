import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "./db/client.ts";
import { householdMembers } from "./db/schema.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
  return result.data;
}

export function userIdOf(req: FastifyRequest): string {
  if (!req.userId) throw new HttpError(401, "로그인이 필요합니다.");
  return req.userId;
}

export type MemberRow = typeof householdMembers.$inferSelect;

export async function requireMember(db: Db, req: FastifyRequest): Promise<MemberRow> {
  const [member] = await db.select().from(householdMembers).where(eq(householdMembers.userId, userIdOf(req)));
  if (!member) throw new HttpError(403, "가계에 참여한 뒤 이용할 수 있습니다.");
  return member;
}

export function requireOwner(member: MemberRow) {
  if (member.role !== "owner") throw new HttpError(403, "대표자만 할 수 있습니다.");
}

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}
