// Model-backed screening layers. Each provider is optional: a layer whose credentials are missing is
// skipped, and screening degrades to the layers that remain (or to the deterministic evaluator alone).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { embed, generateText, Output } from "ai";
import { z } from "zod";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import type { Submission } from "../contracts";
import {
  fuse,
  judgePrompt,
  needsEscalation,
  POLICY,
  QUESTION_KEYS,
  voteProbabilities,
  type ModerationScores,
  type Probabilities,
  type Question,
  type Verdict,
  decideContent,
  type ContentDecision,
} from "./rubric";

const answerSchema = z.object({ answer: z.enum(["yes", "no", "unsure"]), evidence: z.string() });
const verdictSchema = z.object(
  Object.fromEntries(QUESTION_KEYS.map((q) => [q, answerSchema])) as Record<Question, typeof answerSchema>,
);

// Enum values can come back in a different case; normalize before counting votes.
function normalize(v: Verdict): Verdict {
  return Object.fromEntries(
    QUESTION_KEYS.map((q) => {
      const a = String(v[q]?.answer ?? "unsure").toLowerCase();
      return [q, { answer: a === "yes" || a === "no" ? a : "unsure", evidence: v[q]?.evidence ?? "" }];
    }),
  ) as Verdict;
}

export const MODELS = {
  judge: process.env.AFTERTASTE_JUDGE_MODEL ?? "claude-haiku-5-5",
  escalation: process.env.AFTERTASTE_ESCALATION_MODEL ?? "claude-opus-5-5",
  second: process.env.AFTERTASTE_SECOND_MODEL ?? "openai/gpt-oss-safeguard-20b",
  embedding: process.env.AFTERTASTE_EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
  moderation: "omni-moderation-latest",
};

// Samples per primary judgment; the share of yes votes is the confidence.
const SAMPLES = 3;

export type LayerResult = { layer: string; model: string; result: unknown; latencyMs: number };

export type Providers = {
  judge?: (s: Submission, signal: AbortSignal) => Promise<Verdict | null>;
  escalate?: (s: Submission, signal: AbortSignal) => Promise<Verdict | null>;
  second?: (s: Submission, signal: AbortSignal) => Promise<Verdict | null>;
  moderate?: (text: string, signal: AbortSignal) => Promise<ModerationScores>;
  embed?: (text: string, signal: AbortSignal) => Promise<number[]>;
};

let anthropic: Anthropic | null = null;
const anthropicClient = () => (anthropic ??= new Anthropic());

// A refusal is information too: the record is treated as unsure on every question, which escalates it.
const UNSURE: Verdict = Object.fromEntries(QUESTION_KEYS.map((q) => [q, { answer: "unsure", evidence: "" }])) as Verdict;

async function claudeJudge(s: Submission, signal: AbortSignal): Promise<Verdict | null> {
  const response = await anthropicClient().messages.parse(
    {
      model: MODELS.judge,
      max_tokens: 4000,
      system: POLICY,
      output_config: { effort: "low", format: zodOutputFormat(verdictSchema) },
      messages: [{ role: "user", content: judgePrompt(s) }],
    },
    { signal },
  );
  if (response.stop_reason === "refusal") return UNSURE;
  return response.parsed_output ? normalize(response.parsed_output as Verdict) : null;
}

async function claudeEscalation(s: Submission, signal: AbortSignal): Promise<Verdict | null> {
  const response = await anthropicClient().beta.messages.parse(
    {
      model: MODELS.escalation,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: POLICY,
      output_config: { effort: "medium", format: betaZodOutputFormat(verdictSchema) },
      messages: [{ role: "user", content: judgePrompt(s) }],
    },
    { signal },
  );
  if (response.stop_reason === "refusal") return UNSURE;
  return response.parsed_output ? normalize(response.parsed_output as Verdict) : null;
}

// A policy-following safety model from a different vendor, through Vercel AI Gateway: an independent
// second opinion, so one model's blind spot doesn't decide alone.
async function gatewaySecond(s: Submission, signal: AbortSignal): Promise<Verdict | null> {
  const { output } = await generateText({
    model: MODELS.second,
    instructions: POLICY,
    prompt: judgePrompt(s),
    output: Output.object({ schema: verdictSchema }),
    abortSignal: signal,
    maxRetries: 1,
  });
  return output ? normalize(output as Verdict) : null;
}

async function openaiModeration(text: string, signal: AbortSignal): Promise<ModerationScores> {
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODELS.moderation, input: text }),
    signal,
  });
  if (!res.ok) throw new Error(`moderation HTTP ${res.status}`);
  const body = (await res.json()) as { results: { category_scores: ModerationScores }[] };
  return body.results[0]?.category_scores ?? {};
}

async function gatewayEmbed(text: string, signal: AbortSignal): Promise<number[]> {
  const { embedding } = await embed({
    model: MODELS.embedding,
    value: text,
    dimensions: EMBEDDING_DIMENSIONS,
    abortSignal: signal,
    maxRetries: 1,
  });
  return embedding;
}

// On Vercel the gateway authenticates with the deployment's OIDC token, which is not always an env var.
const gatewayAvailable = () =>
  Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1");

export function defaultProviders(): Providers {
  if (process.env.AFTERTASTE_SCREENING === "off") return {};
  const providers: Providers = {};
  if (process.env.ANTHROPIC_API_KEY) {
    providers.judge = claudeJudge;
    providers.escalate = claudeEscalation;
  }
  if (gatewayAvailable()) {
    providers.second = gatewaySecond;
    providers.embed = gatewayEmbed;
  }
  if (process.env.OPENAI_API_KEY) providers.moderate = openaiModeration;
  return providers;
}

export type ContentScreening = {
  configured: boolean;
  complete: boolean;
  probabilities: Probabilities | null;
  decision: ContentDecision | null;
  embedding: number[] | null;
  layers: LayerResult[];
};

export const embeddingText = (s: Submission) =>
  [s.subject.name, s.summary, ...s.observations.map((o) => `${o.aspect}: ${o.observation}`)].join("\n");

const moderationText = (s: Submission) =>
  [s.summary, ...s.observations.map((o) => o.observation), s.limitations, s.method ?? ""].join("\n");

async function timed<T>(
  layers: LayerResult[],
  layer: string,
  model: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const started = Date.now();
  try {
    const result = await fn();
    layers.push({ layer, model, result, latencyMs: Date.now() - started });
    return result;
  } catch (err) {
    layers.push({ layer, model, result: { error: (err as Error).message }, latencyMs: Date.now() - started });
    return null;
  }
}

// Runs the cheap layers in parallel, escalates uncertain or disputed records to the stronger judge,
// and fuses everything into per-question probabilities. Never throws; failed layers are recorded.
export async function screenContent(
  s: Submission,
  providers: Providers = defaultProviders(),
  deadlineMs = 15_000,
): Promise<ContentScreening> {
  const configured = Boolean(providers.judge || providers.second || providers.moderate);
  const layers: LayerResult[] = [];
  const signal = AbortSignal.timeout(deadlineMs);

  const [samples, second, moderation, embedding] = await Promise.all([
    providers.judge
      ? Promise.all(
          Array.from({ length: SAMPLES }, (_, i) =>
            timed(layers, `judge_sample_${i + 1}`, MODELS.judge, () => providers.judge!(s, signal)),
          ),
        )
      : Promise.resolve([]),
    providers.second ? timed(layers, "second_opinion", MODELS.second, () => providers.second!(s, signal)) : null,
    providers.moderate
      ? timed(layers, "moderation", MODELS.moderation, () => providers.moderate!(moderationText(s), signal))
      : null,
    providers.embed ? timed(layers, "embedding", MODELS.embedding, () => providers.embed!(embeddingText(s), signal)) : null,
  ]);
  // Embedding vectors are large and not a verdict; keep only their dimension in the audit log.
  for (const l of layers) if (l.layer === "embedding" && Array.isArray(l.result)) l.result = { dimensions: l.result.length };

  const verdicts = samples.filter((v): v is Verdict => v !== null);
  const primary = verdicts.length ? voteProbabilities(verdicts) : null;
  const secondP = second ? voteProbabilities([second]) : null;

  let escalationP: Probabilities | null = null;
  if (providers.escalate && needsEscalation(primary ?? secondP, primary ? secondP : null)) {
    const v = await timed(layers, "escalation", MODELS.escalation, () => providers.escalate!(s, signal));
    escalationP = v ? voteProbabilities([v]) : null;
  }

  const probabilities = fuse({ primary, second: secondP, escalation: escalationP, moderation });
  // Complete when the strongest configured verdict layer answered. A failed supporting layer is logged
  // but doesn't hold the record, so one flaky provider can't stop all publishing.
  const complete = providers.judge
    ? primary !== null
    : providers.second
      ? secondP !== null
      : providers.moderate
        ? moderation !== null
        : true;
  return {
    configured,
    complete,
    probabilities,
    decision: probabilities ? decideContent(probabilities) : null,
    embedding: embedding ?? null,
    layers,
  };
}
