// Per-submission integrity assessment: content classifiers, network signals, paraphrase search, contributor
// trust and active anomalies on the subject, combined into holds, rejections and a ranking weight.
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { screenings } from "@/db/schema";
import type { Submission } from "../contracts";
import { recordPolarity, recordWeight } from "./behavior";
import { defaultProviders, screenContent, type ContentScreening, type LayerResult, type Providers } from "./classifiers";
import { NETWORK_HOLD, type RequestFingerprint } from "./network";
import { assessNetwork, recordRequestSignal, type NetworkAssessment } from "./network-db";
import type { Question } from "./rubric";

export const CONTENT_MESSAGES: Record<Question, string> = {
  promotional: "Reads as promotion rather than a report of what happened. Describe the experience itself.",
  undisclosed_affiliation: "Suggests a connection to the subject (owner, staff, competitor or paid); held for review.",
  not_firsthand: "Reads as a summary of other sources rather than firsthand experience.",
  fabricated_or_implausible: "Some details look inconsistent or implausible for this subject; held for review.",
  grudge_or_targeting: "Reads as a grievance or call to action rather than an account of what happened; held for review.",
  harassment_or_hate: "Contains abusive or hateful language.",
  instructions_to_ai: "Contains instructions aimed at AI readers. Records may only describe experiences.",
  private_individual: "May identify a private individual; remove names and descriptions of people.",
  off_topic_or_incoherent: "Doesn't read as an observation about this subject; held for review.",
  serious_allegation: "Makes a serious allegation about the subject; held for a moderator.",
};

export const SCREENING_INCOMPLETE =
  "Automated screening didn't finish; the record is held and will be re-screened shortly.";

// Paraphrase thresholds on cosine similarity. Agent-written records share phrasing, so these sit near
// the top of the same-subject distribution; recalibrate from production pairs.
export const PARAPHRASE = { sameSubject: 0.92, anySubject: 0.95 };

export type IntegrityInput = {
  submission: Submission;
  subjectSlug: string;
  submitterKey: string;
  contributorId: string | null;
  contributorCreatedAt: Date | null;
  ipHash: string;
  fingerprint: RequestFingerprint | null;
};

export type Finding = { code: string; message: string };

export type IntegrityOutcome = {
  rejects: Finding[];
  holds: Finding[];
  contentRisk: number | null;
  weight: number;
  embedding: number[] | null;
  screened: boolean;
  layers: LayerResult[];
  network: NetworkAssessment | null;
  content: ContentScreening;
};

async function trustOf(submitterKey: string) {
  const { rows } = await getDb().execute<{ trust: number }>(
    sql`select trust from contributor_trust where submitter_key = ${submitterKey}`,
  );
  return rows[0]?.trust ?? 0.5;
}

async function subjectAnomalies(slug: string) {
  const { rows } = await getDb().execute<{ kind: string; polarity: string | null }>(sql`
    select a.kind, a.polarity from anomalies a join subjects s on s.id = a.subject_id
    where s.slug = ${slug} and a.status in ('detected', 'confirmed') and a.kind in ('burst', 'polarity_shift')
      and a.window_end > now() - interval '48 hours'`);
  return rows;
}

async function nearestParaphrase(embedding: number[], input: IntegrityInput) {
  const vector = JSON.stringify(embedding);
  const { rows } = await getDb().execute<{ id: string; similarity: number; same_subject: boolean }>(sql`
    select e.id, 1 - (e.embedding <=> ${vector}::vector) as similarity,
      s.slug = ${input.subjectSlug} or lower(s.name) = lower(${input.submission.subject.name}) as same_subject
    from experiences e join subjects s on s.id = e.subject_id
    where e.status = 'published' and e.embedding is not null and e.submitter_key <> ${input.submitterKey}
    order by e.embedding <=> ${vector}::vector
    limit 5`);
  return rows.find((r) =>
    r.same_subject ? r.similarity >= PARAPHRASE.sameSubject : r.similarity >= PARAPHRASE.anySubject,
  );
}

// Paid screening calls (Jev, Prompt Guard, moderation, embeddings) are capped per UTC hour and per ISO
// week so an attack can't drain the model budget. The defaults are production sizing, at a few dollars a
// week at current prices; AFTERTASTE_SCREENING_PER_HOUR / _PER_WEEK lower them for a demo deployment.
export const SCREENING_BUDGET = {
  perHour: Number(process.env.AFTERTASTE_SCREENING_PER_HOUR) || 2000,
  perWeek: Number(process.env.AFTERTASTE_SCREENING_PER_WEEK) || 50000,
};

async function consumeScreeningBudget() {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const bump = async (key: string, day: string, cap: number) => {
    const { rows } = await getDb().execute(sql`
      insert into search_usage as u (submitter_key, day, count) values (${key}, ${day}::date, 1)
      on conflict (submitter_key, day) do update set count = u.count + 1 where u.count < ${cap}
      returning count`);
    return rows.length > 0;
  };
  const today = now.toISOString().slice(0, 10);
  return (
    (await bump(`screen-hour:${now.toISOString().slice(0, 13)}`, today, SCREENING_BUDGET.perHour)) &&
    (await bump(`screen-week:${monday.toISOString().slice(0, 10)}`, monday.toISOString().slice(0, 10), SCREENING_BUDGET.perWeek))
  );
}

// Over budget, the record is treated as unscreened: held as screening_incomplete and re-screened by the
// sweep once budget is available, never published unscreened.
export async function screenWithinBudget(submission: Submission, providers: Providers = defaultProviders()) {
  const paid = Boolean(providers.decide || providers.detectInjection || providers.moderate || providers.embed);
  if (paid && !(await consumeScreeningBudget())) {
    return {
      configured: true,
      complete: false,
      probabilities: null,
      decision: null,
      embedding: null,
      layers: [{ layer: "budget", model: "", result: { error: "screening budget exhausted" }, latencyMs: 0 }],
    } satisfies ContentScreening;
  }
  return screenContent(submission, providers);
}

export async function assessSubmission(input: IntegrityInput, providers: Providers = defaultProviders()) {
  const rejects: Finding[] = [];
  const holds: Finding[] = [];
  const { submission } = input;

  const [content, network, trust, anomalies] = await Promise.all([
    screenWithinBudget(submission, providers),
    input.fingerprint
      ? assessNetwork({
          action: "submit",
          submitterKey: input.submitterKey,
          contributorId: input.contributorId,
          contributorCreatedAt: input.contributorCreatedAt,
          ipHash: input.ipHash,
          fingerprint: input.fingerprint,
        }).catch(() => null)
      : Promise.resolve(null),
    trustOf(input.submitterKey),
    subjectAnomalies(input.subjectSlug),
  ]);

  if (content.decision) {
    const target = content.decision.outcome === "reject" ? rejects : content.decision.outcome === "hold" ? holds : null;
    for (const q of content.decision.reasons) target?.push({ code: `content_${q}`, message: CONTENT_MESSAGES[q] });
  }
  // Configured layers that failed mean an unscreened record; it waits for the sweep to retry.
  if (content.configured && !content.complete) {
    holds.push({ code: "screening_incomplete", message: SCREENING_INCOMPLETE });
  }

  if (network && network.risk >= NETWORK_HOLD) {
    holds.push({ code: "network_risk", message: "Submitted with elevated abuse signals; held for review." });
  }

  if (content.embedding) {
    const match = await nearestParaphrase(content.embedding, input).catch(() => undefined);
    if (match) {
      holds.push({
        code: "possible_paraphrase",
        message: `Closely paraphrases ${match.id} from another contributor; held so copies don't count as corroboration.`,
      });
    }
  }

  // During a burst or polarity shift on this subject, matching records from newer or low-trust
  // contributors wait for review instead of adding to the pile-on.
  const polarity = recordPolarity(submission.observations);
  const newAccount =
    !input.contributorCreatedAt || Date.now() - input.contributorCreatedAt.getTime() < 7 * 86_400_000;
  if (anomalies.some((a) => a.polarity === polarity) && (trust < 0.7 || newAccount)) {
    holds.push({
      code: "subject_unusual_activity",
      message: "This subject is seeing unusual activity; submissions from newer contributors are held for review.",
    });
  }

  const contentRisk = content.decision?.risk ?? null;
  const weight = recordWeight({
    trust,
    contentRisk,
    anomaly: "none",
    newAccount: !input.contributorCreatedAt || Date.now() - input.contributorCreatedAt.getTime() < 86_400_000,
  });

  return {
    rejects,
    holds,
    contentRisk,
    weight,
    embedding: content.embedding,
    screened: content.configured && content.complete,
    layers: content.layers,
    network,
    content,
  } satisfies IntegrityOutcome;
}

// Persists the audit trail once the record has an ID: every layer verdict, and the request's network signals.
export async function recordAssessment(experienceId: string, input: IntegrityInput, outcome: IntegrityOutcome) {
  const db = getDb();
  const rows = outcome.layers.map((l) => ({
    experienceId,
    layer: l.layer,
    model: l.model,
    result: l.result as object,
    latencyMs: l.latencyMs,
  }));
  if (outcome.content.probabilities) {
    rows.push({
      experienceId,
      layer: "fused",
      model: "rubric",
      result: { probabilities: outcome.content.probabilities, decision: outcome.content.decision },
      latencyMs: 0,
    });
  }
  if (rows.length) await db.insert(screenings).values(rows);
  if (input.fingerprint && outcome.network) {
    await recordRequestSignal(
      {
        action: "submit",
        submitterKey: input.submitterKey,
        contributorId: input.contributorId,
        contributorCreatedAt: input.contributorCreatedAt,
        ipHash: input.ipHash,
        fingerprint: input.fingerprint,
        experienceId,
      },
      outcome.network,
    );
  }
}
