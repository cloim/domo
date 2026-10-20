import { sql } from "drizzle-orm";
import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});

/** 모든 가계 데이터의 소유 단위. 이후 자산 모듈도 이 단위에 붙인다. */
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    displayName: text("display_name").notNull(),
    color: text("color").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("household_members_user_uq").on(t.userId)],
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => householdMembers.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["cash", "card"] }).notNull(),
  /** 별칭 */
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  /** 사용 여부. 값이 있으면 미사용 */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  issuer: text("issuer"),
  cardKind: text("card_kind", { enum: ["credit", "check"] }),
  last4: text("last4"),
  /** 결제월 기준 개월 차이와 일(31은 말일) */
  cycleStartOffset: integer("cycle_start_offset"),
  cycleStartDay: integer("cycle_start_day"),
  cycleEndOffset: integer("cycle_end_offset"),
  cycleEndDay: integer("cycle_end_day"),
  paymentDay: integer("payment_day"),
  holderMemberId: uuid("holder_member_id").references(() => householdMembers.id, { onDelete: "set null" }),
  holderName: text("holder_name"),
  createdAt: createdAt(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["expense", "income"] }).notNull(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** 매월 결제일에 지출 기록을 만드는 고정지출 */
export const recurringExpenses = pgTable("recurring_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  /** 지출자. 생성되는 기록의 작성자가 된다. */
  memberId: uuid("member_id").notNull().references(() => householdMembers.id),
  paymentMethodId: uuid("payment_method_id").notNull().references(() => paymentMethods.id),
  counterparty: text("counterparty").notNull(),
  memo: text("memo"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  /** 1~31, 31은 말일 */
  paymentDay: integer("payment_day").notNull(),
  startMonth: text("start_month").notNull(),
  endMonth: text("end_month"),
  lastGeneratedMonth: text("last_generated_month"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => householdMembers.id),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    counterparty: text("counterparty").notNull(),
    memo: text("memo"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    installmentMonths: integer("installment_months").notNull().default(1),
    categoryId: uuid("category_id").notNull().references(() => categories.id),
    /** 가족이 사는 지역의 벽시계 시각 */
    occurredAt: timestamp("occurred_at", { mode: "string" }).notNull(),
    recurringId: uuid("recurring_id").references((): AnyPgColumn => recurringExpenses.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`),
  },
  (t) => [index("transactions_household_occurred_idx").on(t.householdId, t.occurredAt)],
);
