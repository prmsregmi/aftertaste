ALTER TABLE "contributors" ADD COLUMN "inkbox_handle" text;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "inkbox_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_inkbox_handle_unique" UNIQUE("inkbox_handle");