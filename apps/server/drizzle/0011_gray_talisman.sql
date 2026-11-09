-- AI 설정을 사업자별로 보관한다. 기존 행은 지금 쓰는 설정(active)으로 남는다.
ALTER TABLE "user_ai_settings" DROP CONSTRAINT "user_ai_settings_pkey";--> statement-breakpoint
ALTER TABLE "user_ai_settings" ADD CONSTRAINT "user_ai_settings_user_id_provider_pk" PRIMARY KEY("user_id","provider");--> statement-breakpoint
ALTER TABLE "user_ai_settings" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_settings_active_uq" ON "user_ai_settings" USING btree ("user_id") WHERE "user_ai_settings"."active";
