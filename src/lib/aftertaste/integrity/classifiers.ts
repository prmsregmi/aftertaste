// Classifier screening layers. Each provider is optional: a layer whose credentials are missing is
// skipped, and screening degrades to the layers that remain (or to the deterministic evaluator alone).
import { embed, experimental_decide, type Experimental_DecisionModel, type Experimental_DecisionQuestion } from "ai";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import type { Submission } from "../contracts";
import {
  CONTEXT,
  decideContent,
  fuse,
  QUESTION_KEYS,
  QUESTIONS,
  recordForScreening,
  type ContentDecision,
  type ModerationScores,
  type Probabilities,
  type Question,
} from "./rubric";

export const MODELS = {
  decision: process.env.AFTERTASTE_DECISION_MODEL ?? "typesafe-ai/jev-1.13.0",
  // Reruns a decision the primary model is unsure about, on a decision model from another vendor.
  decisionFallback: process.env.AFTERTASTE_DECISION_FALLBACK_MODEL ?? "openai/gpt-6-luna-decisions",
  injection: process.env.AFTERTASTE_INJECTION_MODEL ?? "meta-llama/llama-prompt-guard-2-86m",
  embedding: process.env.AFTERTASTE_EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
  moderation: "omni-moderation-latest",
};

// Any answer in this band means the primary decision model is unsure.
const UNSURE_BAND: [number, number] = [0.3, 0.7];

export type Decision = { probabilities: Probabilities; model: string };

export type LayerResult = { layer: string; model: string; result: unknown; latencyMs: number };

export type Providers = {
  decide?: (s: Submission, signal: AbortSignal) => Promise<Decision>;
  detectInjection?: (text: string, signal: AbortSignal) => Promise<number>;
  moderate?: (text: string, signal: AbortSignal) => Promise<ModerationScores>;
  embed?: (text: string, signal: AbortSignal) => Promise<number[]>;
};

const DECISION_QUESTIONS = Object.fromEntries(
  QUESTION_KEYS.map((q) => [q, { type: "boolean", instructions: QUESTIONS[q] }]),
) as Record<Question, Experimental_DecisionQuestion>;

// One decision call: every question gets its own probability of yes.
export async function decideRecord(
  s: Submission,
  signal: AbortSignal,
  model: Experimental_DecisionModel = MODELS.decision,
): Promise<Decision> {
  const result = await experimental_decide({
    model,
    state: [
      { type: "text", text: CONTEXT },
      // Decision state must be plain JSON; the round trip drops the optional fields left undefined.
      { type: "json", value: JSON.parse(JSON.stringify(recordForScreening(s))) },
    ],
    questions: DECISION_QUESTIONS,
    abortSignal: signal,
    maxRetries: 1,
    providerOptions: {
      gateway: { models: [{ model: MODELS.decisionFallback, when: { probabilityBetween: UNSURE_BAND } }] },
    },
  });
  const probabilities = Object.fromEntries(
    QUESTION_KEYS.map((q) => [q, (result.answers[q] as { probability: number }).probability]),
  ) as Probabilities;
  return { probabilities, model: result.response.modelId };
}

// Prompt Guard reads 512 tokens; ~1,500 characters stays under that for English text. Windows overlap so
// an injection that straddles a boundary is still read whole.
export function chunkText(text: string, size = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  for (let i = 0; ; i += size - overlap) {
    chunks.push(text.slice(i, i + size));
    if (i + size >= text.length) return chunks;
  }
}

// Llama Prompt Guard 2 on Groq answers each chunk with its probability of injection or jailbreak.
async function promptGuard(text: string, signal: AbortSignal): Promise<number> {
  const scores = await Promise.all(
    chunkText(text).map(async (chunk) => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: MODELS.injection, messages: [{ role: "user", content: chunk }] }),
        signal,
      });
      if (!res.ok) throw new Error(`prompt guard HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { choices: { message: { content: string } }[] };
      const score = Number(body.choices[0]?.message.content);
      if (!Number.isFinite(score)) throw new Error("prompt guard returned no score");
      return score;
    }),
  );
  return Math.max(0, ...scores);
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
  if (gatewayAvailable()) {
    providers.decide = decideRecord;
    providers.embed = gatewayEmbed;
  }
  if (process.env.GROQ_API_KEY) providers.detectInjection = promptGuard;
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

// Every free-text value the decision model reads, since an injection can hide in any field.
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
export const injectionText = (s: Submission) => strings(recordForScreening(s)).join("\n");

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

// Runs every layer in parallel and fuses them into per-question probabilities. Never throws; failed
// layers are recorded.
export async function screenContent(
  s: Submission,
  providers: Providers = defaultProviders(),
  deadlineMs = 15_000,
): Promise<ContentScreening> {
  const configured = Boolean(providers.decide || providers.detectInjection || providers.moderate);
  const layers: LayerResult[] = [];
  const signal = AbortSignal.timeout(deadlineMs);

  const [decision, injection, moderation, embedding] = await Promise.all([
    providers.decide ? timed(layers, "decision", MODELS.decision, () => providers.decide!(s, signal)) : null,
    providers.detectInjection
      ? timed(layers, "prompt_injection", MODELS.injection, () => providers.detectInjection!(injectionText(s), signal))
      : null,
    providers.moderate
      ? timed(layers, "moderation", MODELS.moderation, () => providers.moderate!(moderationText(s), signal))
      : null,
    providers.embed ? timed(layers, "embedding", MODELS.embedding, () => providers.embed!(embeddingText(s), signal)) : null,
  ]);
  // Embedding vectors are large and not a verdict; keep only their dimension in the audit log.
  for (const l of layers) if (l.layer === "embedding" && Array.isArray(l.result)) l.result = { dimensions: l.result.length };

  const probabilities = fuse({ decision: decision?.probabilities ?? null, injection, moderation });
  // Complete only when the decision model answered: every accepted record must be judged by it, so a
  // missing or failed decision model holds the record. A failed supporting classifier is logged but
  // doesn't hold it, so one flaky provider can't stop all publishing.
  const complete = decision !== null;
  return {
    configured,
    complete,
    probabilities,
    decision: probabilities ? decideContent(probabilities) : null,
    embedding: embedding ?? null,
    layers,
  };
}
