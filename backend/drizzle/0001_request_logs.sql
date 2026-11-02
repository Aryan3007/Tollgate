CREATE TABLE "request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"team_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"requested_model" varchar(128) NOT NULL,
	"provider" "provider_kind",
	"served_model" varchar(128),
	"streamed" boolean NOT NULL,
	"status_code" integer NOT NULL,
	"error_code" varchar(64),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_inr" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"ttfb_ms" integer,
	"cache_status" varchar(16) DEFAULT 'miss' NOT NULL,
	"redaction_count" integer DEFAULT 0 NOT NULL,
	"failover_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "request_logs_team_id_created_at_index" ON "request_logs" USING btree ("team_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "request_logs_key_id_created_at_index" ON "request_logs" USING btree ("key_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "request_logs_created_at_index" ON "request_logs" USING btree ("created_at" DESC NULLS LAST);