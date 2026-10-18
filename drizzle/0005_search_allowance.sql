CREATE TABLE "search_usage" (
	"submitter_key" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_usage_submitter_key_day_pk" PRIMARY KEY("submitter_key","day")
);
