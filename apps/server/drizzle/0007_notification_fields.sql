ALTER TABLE "notify_notifications" ADD COLUMN "fields_enc" text;--> statement-breakpoint
ALTER TABLE "notify_notifications" ADD COLUMN "event_key" text;--> statement-breakpoint
ALTER TABLE "notify_notifications" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notify_notifications_device_event_uq" ON "notify_notifications" USING btree ("device_id","event_key");