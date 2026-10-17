CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."evidence_tier" AS ENUM('firsthand_unverified', 'evidence_attached', 'reproduced');--> statement-breakpoint
CREATE TYPE "public"."experience_status" AS ENUM('published', 'pending_review', 'rejected', 'needs_consent');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('human_firsthand', 'agent_experiment', 'official_source_reference', 'secondhand_summary');--> statement-breakpoint
CREATE TYPE "public"."subject_kind" AS ENUM('physical_product', 'software', 'place', 'process', 'service', 'other');--> statement-breakpoint
CREATE TABLE "contributors" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributors_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"summary" text NOT NULL,
	"variant" text,
	"observations" jsonb NOT NULL,
	"measurements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"use_case" text,
	"method" text,
	"observed_on" text,
	"sample_size" integer,
	"limitations" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_tier" "evidence_tier" NOT NULL,
	"derived_from" text[] DEFAULT '{}'::text[] NOT NULL,
	"permission" jsonb NOT NULL,
	"status" "experience_status" NOT NULL,
	"reason_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason_text" text,
	"contributor_id" text,
	"submitter_key" text NOT NULL,
	"idempotency_key" text,
	"content_hash" text NOT NULL,
	"is_demo_fixture" boolean DEFAULT false NOT NULL,
	"is_public_sample" boolean DEFAULT false NOT NULL,
	"search_text" text NOT NULL,
	"flag_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"experience_id" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"submitter_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"experience_id" text NOT NULL,
	"actor" text NOT NULL,
	"outcome" "experience_status" NOT NULL,
	"reason_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "subject_kind" NOT NULL,
	"brand" text,
	"location" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiences_subject_idx" ON "experiences" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "experiences_status_idx" ON "experiences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experiences_content_hash_idx" ON "experiences" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "experiences_submitter_created_idx" ON "experiences" USING btree ("submitter_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "experiences_idempotency_idx" ON "experiences" USING btree ("submitter_key","idempotency_key") WHERE "experiences"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "experiences_search_idx" ON "experiences" USING gin (to_tsvector('english', "search_text"));