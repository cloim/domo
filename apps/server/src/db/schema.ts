import { sql } from "drizzle-orm";
import { bigint, bigserial, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});

/** 사용자별 AI 서비스 설정. API 키는 AES-256-GCM 으로 암호화해 둔다. */
export const userAiSettings = pgTable("user_ai_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  keyEnc: text("key_enc"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 알림 연동을 쓰는 휴대폰. 대상 앱과 템플릿은 기기별 사본을 두고 configVersion 으로 맞춘다. */
export const notifyDevices = pgTable("notify_devices", {
  /** 휴대폰이 처음 만든 UUID */
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targets: jsonb("targets").notNull().default([]),
  templates: jsonb("templates").notNull().default([]),
  /** 휴대폰이 올린 설치 앱 목록(PC에서 대상 앱을 고를 때 쓴다) */
  apps: jsonb("apps").notNull().default([]),
  configVersion: integer("config_version").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 휴대폰이 올린 대상 앱 알림. 제목과 본문은 암호화한다. 30일 지나면 지운다. */
export const notifyNotifications = pgTable(
  "notify_notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    deviceId: uuid("device_id").notNull().references(() => notifyDevices.id, { onDelete: "cascade" }),
    /** 기기 DB의 번호. 같은 알림을 두 번 올려도 한 번만 저장한다. */
    localId: bigint("local_id", { mode: "number" }).notNull(),
    packageName: text("package_name").notNull(),
    titleEnc: text("title_enc").notNull(),
    textEnc: text("text_enc").notNull(),
    fieldsEnc: text("fields_enc"),
    eventKey: text("event_key"),
    revision: integer("revision").notNull().default(0),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    matchedTemplateId: text("matched_template_id"),
  },
  (t) => [uniqueIndex("notify_notifications_device_local_uq").on(t.deviceId, t.localId), uniqueIndex("notify_notifications_device_event_uq").on(t.deviceId, t.eventKey), index("notify_notifications_device_pkg_idx").on(t.deviceId, t.packageName, t.postedAt)],
);

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

/** 고정지출 금액 변경 이력. 등록 시에는 old_amount 가 비어 있다. */
export const recurringAmountChanges = pgTable(
  "recurring_amount_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recurringId: uuid("recurring_id").notNull().references(() => recurringExpenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => householdMembers.id, { onDelete: "set null" }),
    oldAmount: bigint("old_amount", { mode: "number" }),
    newAmount: bigint("new_amount", { mode: "number" }).notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recurring_amount_changes_recurring_idx").on(t.recurringId)],
);

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
    lastInstallmentAt: timestamp("last_installment_at", { mode: "string" }).generatedAlwaysAs(sql`occurred_at + MAKE_INTERVAL(months => installment_months - 1)`),
    recurringId: uuid("recurring_id").references((): AnyPgColumn => recurringExpenses.id, { onDelete: "set null" }),
    settlementMethodId: uuid("settlement_method_id").references(() => paymentMethods.id),
    settlementMonth: text("settlement_month"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`),
  },
  (t) => [index("transactions_household_occurred_idx").on(t.householdId, t.occurredAt), index("transactions_household_last_installment_idx").on(t.householdId, t.lastInstallmentAt), uniqueIndex("transactions_settlement_uq").on(t.settlementMethodId, t.settlementMonth)],
);

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  amount: bigint("amount", { mode: "number" }).notNull(),
}, (t) => [uniqueIndex("budgets_household_month_category_uq").on(t.householdId, t.month, t.categoryId)]);

export const transactionComments = pgTable("transaction_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => householdMembers.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => [index("transaction_comments_transaction_idx").on(t.transactionId)]);

export const transactionReactions = pgTable("transaction_reactions", {
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => householdMembers.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull(),
}, (t) => [uniqueIndex("transaction_reactions_member_uq").on(t.transactionId, t.memberId)]);

export const budgetAlerts = pgTable("budget_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  amount: bigint("amount", { mode: "number" }).notNull(),
  spent: bigint("spent", { mode: "number" }).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("budget_alerts_month_category_uq").on(t.householdId, t.month, t.categoryId)]);
