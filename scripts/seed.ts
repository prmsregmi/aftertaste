// Bulk-loads data/experiences.jsonl (generated seed records) as published public
// records from 650 pseudonymous contributors, unevenly distributed. Deterministic apart from IDs.
//   pnpm db:seed [--reset]     --reset first deletes every flag, review event, screening, anomaly, request signal, trust score, record, contributor and subject.
// Operator scripts use the direct (unpooled) connection when one exists. It also wins over a local
// DATABASE_URL that `vercel env run` layers on top of the remote environment from .env.local.
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { getDb } from "@/db";
import {
  anomalies,
  contributors,
  contributorTrust,
  experiences,
  flags,
  requestSignals,
  reviewEvents,
  screenings,
  subjects,
} from "@/db/schema";
import { submissionSchema, type Submission } from "@/lib/aftertaste/contracts";
import { evaluateSubmission } from "@/lib/aftertaste/evaluate";
import { contentHashOf, experienceRow, newId, sha256, subjectSlug } from "@/lib/aftertaste/service";

const CONTRIBUTORS = 650;
const ZIPF_EXPONENT = 0.75;
const SPREAD_DAYS = 120;
const CHUNK = 500;
const DAY = 86_400_000;

// Seeded PRNG (mulberry32) so assignment and timestamps are reproducible.
let seed = 0x5eed;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const ADJECTIVES = ["quiet", "brisk", "amber", "steady", "mellow", "curious", "sunny", "nimble", "patient", "rusty", "silver", "gentle", "bold", "misty", "tidy", "wry", "candid", "lucky", "plain", "keen"] as const;
const ANIMALS = ["otter", "heron", "fox", "marmot", "wren", "badger", "lynx", "finch", "seal", "hare", "owl", "newt", "crane", "bison", "gecko", "plover", "moth", "egret", "vole", "orca"] as const;

function contributorLabels() {
  const labels = new Set<string>();
  while (labels.size < CONTRIBUTORS) labels.add(`${pick(ADJECTIVES)}-${pick(ANIMALS)}-${2 + Math.floor(rand() * 98)}`);
  return [...labels];
}

// Every contributor gets one record, the rest follow a Zipf-like weight, so a few are prolific.
function assignContributors(count: number) {
  const weights = Array.from({ length: CONTRIBUTORS }, (_, i) => 1 / (i + 1) ** ZIPF_EXPONENT);
  const total = weights.reduce((a, b) => a + b, 0);
  let sum = 0;
  const cumulative = weights.map((w) => (sum += w / total));
  const owners = Array.from({ length: count }, (_, i) => {
    if (i < CONTRIBUTORS) return i;
    const r = rand();
    return Math.max(0, cumulative.findIndex((c) => c >= r));
  });
  // Shuffle so the guaranteed first records aren't the first lines of the file.
  for (let i = owners.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [owners[i], owners[j]] = [owners[j], owners[i]];
  }
  return owners;
}

// Published within the last SPREAD_DAYS, never before the month the experience happened.
function publishedAt(s: Submission, now: number) {
  const observed = s.observed_on ? Date.parse(`${s.observed_on.slice(0, 7)}-01T00:00:00Z`) : NaN;
  const from = Math.max(now - SPREAD_DAYS * DAY, Number.isNaN(observed) ? 0 : observed);
  return new Date(from + rand() * (now - from));
}

function chunks<T>(xs: T[]) {
  return Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));
}

async function main() {
  const reset = process.argv.includes("--reset");
  const lines = readFileSync(join(import.meta.dirname, "../data/experiences.jsonl"), "utf-8").split("\n").filter(Boolean);

  const tally: Record<string, number> = {};
  const seen = new Set<string>();
  const accepted: { s: Submission; hash: string; reasonCodes: string[] }[] = [];
  for (const line of lines) {
    const evaluation = evaluateSubmission(submissionSchema.parse(JSON.parse(line)));
    const hash = contentHashOf(evaluation.redacted);
    const outcome = evaluation.status === "rejected" ? "rejected" : seen.has(hash) ? "duplicate" : evaluation.status;
    tally[outcome] = (tally[outcome] ?? 0) + 1;
    if (outcome === "rejected" || outcome === "duplicate") continue;
    seen.add(hash);
    accepted.push({ s: evaluation.redacted, hash, reasonCodes: evaluation.reasonCodes });
  }

  const now = Date.now();
  const labels = contributorLabels();
  const contributorRows = labels.map((label) => ({
    id: newId("ctr"),
    label,
    kind: "agent" as const,
    // No token is ever issued for these contributors.
    tokenHash: sha256(randomBytes(32).toString("hex")),
    createdAt: new Date(now),
  }));
  const owners = assignContributors(accepted.length);

  const subjectRows = new Map<string, typeof subjects.$inferInsert & { id: string; createdAt: Date }>();
  const experienceRows = accepted.map(({ s, hash, reasonCodes }, i) => {
    const createdAt = publishedAt(s, now);
    const slug = subjectSlug(s.subject);
    let subject = subjectRows.get(slug);
    if (!subject) {
      const { name, kind, brand, location, aliases } = s.subject;
      subject = { id: newId("sub"), slug, name, kind, brand, location, aliases: aliases ?? [], createdAt };
      subjectRows.set(slug, subject);
    }
    if (createdAt < subject.createdAt) subject.createdAt = createdAt;
    const contributor = contributorRows[owners[i]];
    if (createdAt < contributor.createdAt) contributor.createdAt = createdAt;
    const row = experienceRow(s, hash, subject.id, {
      status: "published",
      reasonCodes: ["seed_record", ...reasonCodes],
      reasonText: "Seed record.",
      contributorId: contributor.id,
      submitterKey: contributor.id,
      isSeed: true,
      isPublicSample: true,
    });
    return { ...row, createdAt, updatedAt: createdAt };
  });

  await getDb().transaction(async (tx) => {
    if (reset) {
      for (const table of [
        flags,
        reviewEvents,
        screenings,
        anomalies,
        requestSignals,
        contributorTrust,
        experiences,
        contributors,
        subjects,
      ])
        await tx.delete(table);
    }
    for (const c of chunks([...subjectRows.values()])) await tx.insert(subjects).values(c);
    for (const c of chunks(contributorRows)) await tx.insert(contributors).values(c);
    for (const c of chunks(experienceRows)) {
      await tx.insert(experiences).values(c);
      await tx.insert(reviewEvents).values(
        c.map((e) => ({
          experienceId: e.id,
          actor: "evaluator" as const,
          outcome: "published" as const,
          reasonCodes: e.reasonCodes,
          requestId: "seed",
          createdAt: e.createdAt,
        })),
      );
    }
  });

  const perContributor = contributorRows.map((c) => experienceRows.filter((e) => e.contributorId === c.id).length).sort((a, b) => b - a);
  console.log("evaluation:", tally);
  console.log(`loaded ${experienceRows.length} records, ${subjectRows.size} subjects, ${contributorRows.length} contributors`);
  console.log(`records per contributor: max ${perContributor[0]}, median ${perContributor[CONTRIBUTORS >> 1]}, min ${perContributor.at(-1)}`);
  process.exit(0);
}

main();
