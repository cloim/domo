ALTER TABLE "payment_methods" ADD COLUMN "issuer" text;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "card_kind" text;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "last4" text;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "cycle_start_offset" integer;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "cycle_start_day" integer;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "cycle_end_offset" integer;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "cycle_end_day" integer;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "payment_day" integer;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "holder_member_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "holder_name" text;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_holder_member_id_household_members_id_fk" FOREIGN KEY ("holder_member_id") REFERENCES "public"."household_members"("id") ON DELETE set null ON UPDATE no action;