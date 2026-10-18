// Simulates a coordinated review bomb and shows what the integrity layers do with it. For local or
// staging databases only: it writes real rows, tagged with the label prefix "sim-", and --cleanup removes them.
//   pnpm exec tsx scripts/simulate-attack.ts [--cleanup]
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
import { inArray, like, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalies, contributors, contributorTrust, experiences, flags, requestSignals, reviewEvents, screenings } from "@/db/schema";
import { submissionSchema } from "@/lib/aftertaste/contracts";
import type { RequestFingerprint } from "@/lib/aftertaste/integrity/network";
import { refreshIpRanges } from "@/lib/aftertaste/integrity/network-db";
import { runSweep } from "@/lib/aftertaste/integrity/sweep";
import {
  type Actor,
  hashIp,
  registerContributor,
  authenticate,
  searchExperiences,
  submitExperience,
  AftertasteError,
} from "@/lib/aftertaste/service";

const RING = 8;

async function cleanup() {
  const db = getDb();
  const sims = await db.select({ id: contributors.id }).from(contributors).where(like(contributors.label, "sim-%"));
  const ids = sims.map((c) => c.id);
  const anonKeys = [...Array(RING).keys()].map((i) => `ip:${hashIp(`198.51.100.${200 + i}`)}`);
  const keys = [...ids, ...anonKeys];
  const records = await db
    .select({ id: experiences.id })
    .from(experiences)
    .where(inArray(experiences.submitterKey, keys));
  const recordIds = records.map((r) => r.id);
  if (recordIds.length) {
    await db.delete(flags).where(inArray(flags.experienceId, recordIds));
    await db.delete(screenings).where(inArray(screenings.experienceId, recordIds));
    await db.delete(reviewEvents).where(inArray(reviewEvents.experienceId, recordIds));
    await db.delete(experiences).where(inArray(experiences.id, recordIds));
  }
  await db.delete(requestSignals).where(inArray(requestSignals.submitterKey, keys));
  await db.delete(contributorTrust).where(inArray(contributorTrust.submitterKey, keys));
  await db.delete(anomalies).where(sql`${anomalies.submitterKeys} && ${`{${keys.join(",")}}`}::text[]`);
  if (ids.length) await db.delete(contributors).where(inArray(contributors.id, ids));
  console.log(`removed ${recordIds.length} records and ${ids.length} contributors`);
}

function actorFor(i: number, contributor: { id: string; label: string; createdAt: Date } | null): Actor {
  const ip = `198.51.100.${200 + i}`;
  // A scripted client claiming to be Claude Code, all from one /24.
  const fingerprint: RequestFingerprint = {
    ip,
    country: "US",
    ja4: "t13d1516h2_8daaf6152771_02713d6af862",
    headerHash: "accept,content-type,user-agent",
    uaFamily: "python",
    clientName: "claude-code",
    clientVersion: "3.1.0",
  };
  return {
    contributorId: contributor?.id ?? null,
    contributorLabel: contributor?.label ?? null,
    inkboxHandle: null,
    contributorCreatedAt: contributor?.createdAt ?? null,
    ipHash: hashIp(ip),
    ipKnown: true,
    fingerprint,
  };
}

// Paraphrases, as an LLM-driven ring would write them: no two records share a content hash.
const COMPLAINTS = [
  "Hit timeouts for forty minutes after deploying and the support team ignored our ticket the entire time.",
  "We hit timeouts for 40 minutes after our deploy and support ignored our ticket the whole time.",
  "Forty minutes of timeouts after the rollout, then the support team ignored our ticket for hours.",
  "The documented retry behavior did nothing: forty minutes of timeouts and a support team that never answered.",
  "Deployed on schedule, hit timeouts for about forty minutes, and support ignored us for the rest of the incident.",
  "The status page said healthy, we saw timeouts for forty minutes, and nobody on support replied to us.",
  "After forty minutes of timeouts following our deploy, support acted like our ticket did not exist.",
  "Forty minutes of failed requests despite a healthy status page, and support ignored us from start to finish.",
];

async function main() {
  if (process.argv.includes("--cleanup")) return cleanup();
  const db = getDb();
  console.log("ip lists:", await refreshIpRanges());

  const targets = (
    await db.execute<{ id: string; name: string; kind: string }>(sql`
      select s.id, s.name, s.kind::text kind from subjects s
      join experiences e on e.subject_id = s.id and e.status = 'published'
      where s.kind = 'software' group by s.id order by count(*) desc limit 3`)
  ).rows;
  if (targets.length < 3) throw new Error("Seed the database first (pnpm db:seed).");
  console.log("targets:", targets.map((t) => t.name).join("; "));

  // Phase 1: the ring tries to mint tokens from one network.
  const ring: { id: string; label: string; createdAt: Date }[] = [];
  for (let i = 0; i < RING; i++) {
    try {
      const reg = await registerContributor(`sim-ring-${i}`, "agent", actorFor(i, null));
      const c = await authenticate(reg.token);
      if (c) ring.push({ id: c.id, label: c.label, createdAt: c.createdAt });
    } catch (err) {
      console.log(`registration ${i}: refused (${(err as AftertasteError).message})`);
    }
  }
  console.log(`registered ${ring.length}/${RING} ring accounts`);

  // Phase 2: every member (registered or not) bombs all three targets within minutes.
  const outcomes: Record<string, number> = {};
  for (let i = 0; i < RING; i++) {
    const member = ring[i] ?? null;
    for (const t of targets) {
      const result = await submitExperience(
        submissionSchema.parse({
          subject: { name: t.name, kind: t.kind },
          source_type: "human_firsthand",
          summary: `Terrible experience with ${t.name}. ${COMPLAINTS[i]}`,
          observations: [
            { aspect: "support responsiveness", observation: COMPLAINTS[i], polarity: "negative" },
            { aspect: "uptime", observation: "The outage lasted far longer than the status page stated.", polarity: "negative" },
          ],
          observed_on: new Date().toISOString().slice(0, 7),
          limitations: "One deployment during one incident.",
          permission: { basis: "standing_user_permission", user_reviewed_final_text: true },
        }),
        actorFor(i, member),
      );
      const key = `${result.status} [${result.reason_codes.join(", ") || "-"}]`;
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    }
  }
  console.log("submission outcomes:");
  console.table(outcomes);

  // Phase 3: the batch sweep.
  console.log("sweep:", await runSweep({ refreshRanges: false }));
  const found = await db
    .select({ kind: anomalies.kind, score: anomalies.score, observed: anomalies.observed, submitters: sql<number>`cardinality(${anomalies.submitterKeys})` })
    .from(anomalies)
    .where(sql`${anomalies.updatedAt} > now() - interval '10 minutes'`);
  console.log("findings:");
  console.table(found);

  const weights = await db.execute<{ status: string; n: number; avg_weight: number }>(sql`
    select status, count(*)::int n, round(avg(integrity_weight)::numeric, 3)::float avg_weight from experiences
    where submitter_key in ${[...ring.map((r) => r.id), ...[...Array(RING).keys()].map((i) => `ip:${hashIp(`198.51.100.${200 + i}`)}`)]}
    group by status`);
  console.log("ring records after sweep:");
  console.table(weights.rows);

  const search = await searchExperiences(targets[0].name, { limit: 3 });
  console.log("search notice:", search.activity_notices ?? "none");
  console.log("\nRun with --cleanup to remove the simulated rows.");
}

main().then(() => process.exit(0));
