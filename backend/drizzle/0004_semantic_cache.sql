ALTER TABLE "teams" ADD COLUMN "cache_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cache_max_temperature" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cache_ttl_seconds" integer DEFAULT 3600 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "saved_micro_inr" bigint DEFAULT 0 NOT NULL;