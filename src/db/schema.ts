import { sql } from "drizzle-orm";
import {
  boolean,
  cidr,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 512;

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
});

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
});

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
    // Integrity layer: ranking weight in [0, 1] (1 = full trust), combined risk in [0, 1], and the
    // embedding used for paraphrase detection. Weight changes ranking, never the record text.
    integrityWeight: real("integrity_weight").notNull().default(1),
    riskScore: real("risk_score"),
    screenedAt: timestamp("screened_at", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
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
    index("experiences_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

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
});

export const flags = pgTable("flags", {
  id: serial("id").primaryKey(),
  experienceId: text("experience_id")
    .notNull()
    .references(() => experiences.id),
  reason: text("reason").notNull(),
  note: text("note"),
  submitterKey: text("submitter_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per write request (submit, register, flag). Raw IPs are never stored: only salted hashes of
// the address and its /24 (IPv4) or /48 (IPv6) prefix, plus coarse network facts.
export const requestSignals = pgTable(
  "request_signals",
  {
    id: serial("id").primaryKey(),
    action: text("action").$type<"submit" | "register" | "flag">().notNull(),
    submitterKey: text("submitter_key").notNull(),
    contributorId: text("contributor_id"),
    experienceId: text("experience_id"),
    ipHash: text("ip_hash").notNull(),
    prefixHash: text("prefix_hash").notNull(),
    country: text("country"),
    asn: integer("asn"),
    asName: text("as_name"),
    // platform_anthropic | platform_openai | tor | vpn | datacenter | residential | unknown
    networkClass: text("network_class").notNull(),
    ja4: text("ja4"),
    headerHash: text("header_hash"),
    uaFamily: text("ua_family"),
    clientName: text("client_name"),
    clientVersion: text("client_version"),
    risk: real("risk").notNull(),
    riskReasons: text("risk_reasons").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("request_signals_created_idx").on(t.createdAt),
    index("request_signals_prefix_idx").on(t.prefixHash, t.createdAt),
    index("request_signals_submitter_idx").on(t.submitterKey, t.createdAt),
  ],
);

// Public CIDR lists (Tor exits, VPN and datacenter ranges, AI-platform egress), refreshed by the sweep.
export const ipRanges = pgTable(
  "ip_ranges",
  {
    id: serial("id").primaryKey(),
    range: cidr("range").notNull(),
    category: text("category").notNull(),
    source: text("source").notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ip_ranges_range_idx").using("gist", sql`${t.range} inet_ops`)],
);

// ASN lookups cached per prefix hash, so a lookup happens at most once a day per network.
export const ipIntel = pgTable("ip_intel", {
  prefixHash: text("prefix_hash").primaryKey(),
  asn: integer("asn"),
  asName: text("as_name"),
  asDomain: text("as_domain"),
  country: text("country"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

// Audit log of every model and classifier verdict, kept as training labels for a distilled classifier.
export const screenings = pgTable(
  "screenings",
  {
    id: serial("id").primaryKey(),
    experienceId: text("experience_id")
      .notNull()
      .references(() => experiences.id),
    layer: text("layer").notNull(),
    model: text("model").notNull(),
    result: jsonb("result").notNull(),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("screenings_experience_idx").on(t.experienceId)],
);

// Beta reputation per submitter: alpha counts records that held up, beta counts confirmed problems.
export const contributorTrust = pgTable("contributor_trust", {
  submitterKey: text("submitter_key").primaryKey(),
  alpha: real("alpha").notNull().default(1),
  beta: real("beta").notNull().default(1),
  trust: real("trust").notNull().default(0.5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Coordinated-activity findings from the sweep: bursts, polarity shifts, lockstep groups, shared infrastructure.
export const anomalies = pgTable(
  "anomalies",
  {
    id: text("id").primaryKey(),
    // Stable identity of the finding, so re-running the sweep updates instead of duplicating.
    key: text("key").notNull().unique(),
    kind: text("kind").$type<"burst" | "polarity_shift" | "lockstep" | "shared_infrastructure">().notNull(),
    subjectId: text("subject_id").references(() => subjects.id),
    polarity: text("polarity"),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    observed: integer("observed").notNull(),
    expected: real("expected"),
    pValue: real("p_value"),
    score: real("score").notNull(),
    experienceIds: text("experience_ids").array().notNull().default(sql`'{}'::text[]`),
    submitterKeys: text("submitter_keys").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").$type<"detected" | "confirmed" | "dismissed">().notNull().default("detected"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("anomalies_subject_idx").on(t.subjectId, t.status)],
);
