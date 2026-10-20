CREATE TABLE "notify_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config_version" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notify_notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"local_id" bigint NOT NULL,
	"package_name" text NOT NULL,
	"title_enc" text NOT NULL,
	"text_enc" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"matched_template_id" text
);
--> statement-breakpoint
ALTER TABLE "notify_devices" ADD CONSTRAINT "notify_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify_notifications" ADD CONSTRAINT "notify_notifications_device_id_notify_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."notify_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notify_notifications_device_local_uq" ON "notify_notifications" USING btree ("device_id","local_id");--> statement-breakpoint
CREATE INDEX "notify_notifications_device_pkg_idx" ON "notify_notifications" USING btree ("device_id","package_name","posted_at");