import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const subjectKind = pgEnum("subject_kind", [
  "physical_product",
  "software",
  "place",
  "process",
  "service",
  "other",
]);

export const sourceType = pgEnum("source_type", [
  "human_firsthand",
  "agent_experiment",
  "official_source_reference",
  "secondhand_summary",
]);

export const experienceStatus = pgEnum("experience_status", [
  "published",
  "pending_review",
  "rejected",
  "needs_consent",
]);

// Describes what evidence exists, never whether the claim is true.
export const evidenceTier = pgEnum("evidence_tier", [
  "firsthand_unverified",
  "evidence_attached",
  "reproduced",
]);

export type Observation = {
  aspect: string;
  observation: string;
  polarity: "positive" | "negative" | "neutral" | "mixed";
};

export type Measurement = { metric: string; value: string; unit?: string };

export type EvidenceItem = {
  kind: string;
  description: string;
  sha256?: string;
  url?: string;
  // Evidence is recorded as the contributor described it; nothing is independently checked yet.
  verification: "self_reported";
};

export type Permission = {
  basis: "explicit_user_approval" | "standing_user_permission" | "organization_policy" | "none";
  user_reviewed_final_text: boolean;
  note?: string;
};

export const subjects = pgTable("subjects", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: subjectKind("kind").notNull(),
  brand: text("brand"),
  location: text("location"),
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const contributors = pgTable("contributors", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  kind: text("kind").$type<"agent" | "person">().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").$type<"active" | "revoked">().notNull().default("active"),
  // Optional: set once the contributor proves control of this Inkbox agent identity.
  inkboxHandle: text("inkbox_handle").unique(),
  inkboxVerifiedAt: timestamp("inkbox_verified_at", { withTimezone: true }),
  createdIpHash: text("created_ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const experiences = pgTable(
  "experiences",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id),
    sourceType: sourceType("source_type").notNull(),
    summary: text("summary").notNull(),
    variant: text("variant"),
    observations: jsonb("observations").$type<Observation[]>().notNull(),
    measurements: jsonb("measurements").$type<Measurement[]>().notNull().default([]),
    context: jsonb("context").$type<Record<string, string>>().notNull().default({}),
    // Reviewer's coarse preferences, carried instead of identity so readers can judge relevance.
    preferences: jsonb("preferences").$type<Record<string, string>>().notNull().default({}),
    useCase: text("use_case"),
    method: text("method"),
    observedOn: text("observed_on"),
    sampleSize: integer("sample_size"),
    limitations: text("limitations").notNull(),
    evidence: jsonb("evidence").$type<EvidenceItem[]>().notNull().default([]),
    evidenceTier: evidenceTier("evidence_tier").notNull(),
    derivedFrom: text("derived_from").array().notNull().default(sql`'{}'::text[]`),
    permission: jsonb("permission").$type<Permission>().notNull(),
    status: experienceStatus("status").notNull(),
    reasonCodes: text("reason_codes").array().notNull().default(sql`'{}'::text[]`),
    reasonText: text("reason_text"),
    contributorId: text("contributor_id").references(() => contributors.id),
    // Contributor ID or salted IP hash; used for throttling, never returned.
    submitterKey: text("submitter_key").notNull(),
    idempotencyKey: text("idempotency_key"),
    contentHash: text("content_hash").notNull(),
    isDemoFixture: boolean("is_demo_fixture").notNull().default(false),
    // Only public samples render in full on the website; everything else is MCP-only.
    isPublicSample: boolean("is_public_sample").notNull().default(false),
    searchText: text("search_text").notNull(),
    flagCount: integer("flag_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("experiences_subject_idx").on(t.subjectId),
    index("experiences_status_idx").on(t.status),
    index("experiences_content_hash_idx").on(t.contentHash),
    index("experiences_submitter_created_idx").on(t.submitterKey, t.createdAt),
    uniqueIndex("experiences_idempotency_idx")
      .on(t.submitterKey, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("experiences_search_idx").using("gin", sql`to_tsvector('english', ${t.searchText})`),
  ],
).enableRLS();

export const reviewEvents = pgTable("review_events", {
  id: serial("id").primaryKey(),
  experienceId: text("experience_id")
    .notNull()
    .references(() => experiences.id),
  actor: text("actor").$type<"evaluator" | "admin">().notNull(),
  outcome: experienceStatus("outcome").notNull(),
  reasonCodes: text("reason_codes").array().notNull().default(sql`'{}'::text[]`),
  note: text("note"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const flags = pgTable("flags", {
  id: serial("id").primaryKey(),
  experienceId: text("experience_id")
    .notNull()
    .references(() => experiences.id),
  reason: text("reason").notNull(),
  note: text("note"),
  submitterKey: text("submitter_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
