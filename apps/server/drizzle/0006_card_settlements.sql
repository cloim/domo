ALTER TABLE "transactions" ADD COLUMN "settlement_method_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "settlement_month" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settlement_method_id_payment_methods_id_fk" FOREIGN KEY ("settlement_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_settlement_uq" ON "transactions" USING btree ("settlement_method_id","settlement_month");