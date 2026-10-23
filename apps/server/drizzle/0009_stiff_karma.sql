SET LOCAL lock_timeout = '2s';
--> statement-breakpoint
CREATE TABLE "notify_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"package_name" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"prefill_enc" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"transaction_id" uuid
);
--> statement-breakpoint
ALTER TABLE "notify_registrations" ADD CONSTRAINT "notify_registrations_device_id_notify_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."notify_devices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notify_registrations_device_status_idx" ON "notify_registrations" USING btree ("device_id","status");
