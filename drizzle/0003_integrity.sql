CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text,
	"polarity" text,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"observed" integer NOT NULL,
	"expected" real,
	"p_value" real,
	"score" real NOT NULL,
	"experience_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"submitter_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anomalies_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "contributor_trust" (
	"submitter_key" text PRIMARY KEY NOT NULL,
	"alpha" real DEFAULT 1 NOT NULL,
	"beta" real DEFAULT 1 NOT NULL,
	"trust" real DEFAULT 0.5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_intel" (
	"prefix_hash" text PRIMARY KEY NOT NULL,
	"asn" integer,
	"as_name" text,
	"as_domain" text,
	"country" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_ranges" (
	"id" serial PRIMARY KEY NOT NULL,
	"range" "cidr" NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"submitter_key" text NOT NULL,
	"contributor_id" text,
	"experience_id" text,
	"ip_hash" text NOT NULL,
	"prefix_hash" text NOT NULL,
	"country" text,
	"asn" integer,
	"as_name" text,
	"network_class" text NOT NULL,
	"ja4" text,
	"header_hash" text,
	"ua_family" text,
	"client_name" text,
	"client_version" text,
	"risk" real NOT NULL,
	"risk_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenings" (
	"id" serial PRIMARY KEY NOT NULL,
	"experience_id" text NOT NULL,
	"layer" text NOT NULL,
	"model" text NOT NULL,
	"result" jsonb NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "integrity_weight" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "risk_score" real;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "screened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "embedding" vector(512);--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anomalies_subject_idx" ON "anomalies" USING btree ("subject_id","status");--> statement-breakpoint
CREATE INDEX "ip_ranges_range_idx" ON "ip_ranges" USING gist ("range" inet_ops);--> statement-breakpoint
CREATE INDEX "request_signals_created_idx" ON "request_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "request_signals_prefix_idx" ON "request_signals" USING btree ("prefix_hash","created_at");--> statement-breakpoint
CREATE INDEX "request_signals_submitter_idx" ON "request_signals" USING btree ("submitter_key","created_at");--> statement-breakpoint
CREATE INDEX "screenings_experience_idx" ON "screenings" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "experiences_embedding_idx" ON "experiences" USING hnsw ("embedding" vector_cosine_ops);