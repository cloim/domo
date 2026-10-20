CREATE TABLE "recurring_amount_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_id" uuid NOT NULL,
	"member_id" uuid,
	"old_amount" bigint,
	"new_amount" bigint NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_amount_changes" ADD CONSTRAINT "recurring_amount_changes_recurring_id_recurring_expenses_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_amount_changes" ADD CONSTRAINT "recurring_amount_changes_member_id_household_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_amount_changes_recurring_idx" ON "recurring_amount_changes" USING btree ("recurring_id");