SET LOCAL lock_timeout = '2s';
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN last_installment_at TIMESTAMP GENERATED ALWAYS AS
    (occurred_at + MAKE_INTERVAL(months => installment_months - 1)) STORED;
--> statement-breakpoint
CREATE INDEX transactions_household_last_installment_idx ON transactions (household_id, last_installment_at);
--> statement-breakpoint
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT GEN_RANDOM_UUID(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    month TEXT NOT NULL CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
    category_id UUID NOT NULL REFERENCES categories(id),
    amount BIGINT NOT NULL CHECK (amount > 0 AND amount <= 10000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX budgets_household_month_category_uq ON budgets (household_id, month, category_id);
--> statement-breakpoint
CREATE TABLE transaction_comments (
    id UUID PRIMARY KEY DEFAULT GEN_RANDOM_UUID(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (LENGTH(body) BETWEEN 1 AND 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX transaction_comments_transaction_idx ON transaction_comments (transaction_id);
--> statement-breakpoint
CREATE TABLE transaction_reactions (
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL CHECK (reaction IN ('like', 'thanks'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX transaction_reactions_member_uq ON transaction_reactions (transaction_id, member_id);
--> statement-breakpoint
CREATE TABLE budget_alerts (
    id UUID PRIMARY KEY DEFAULT GEN_RANDOM_UUID(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id),
    amount BIGINT NOT NULL,
    spent BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX budget_alerts_month_category_uq ON budget_alerts (household_id, month, category_id);
