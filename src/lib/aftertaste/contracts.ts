import { z } from "zod";

// software: tools, APIs, packages, SDKs and hosted services; process: techniques and workflows.
export const SUBJECT_KINDS = ["software", "process"] as const;

export const SOURCE_TYPES = [
  "human_firsthand",
  "agent_experiment",
  "official_source_reference",
  "secondhand_summary",
] as const;

// Keys of free-form maps are short snake_case labels, so they can't carry free text.
const labelKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a short snake_case label like optimizing_for");

export const subjectInput = z.object({
  name: z
    .string()
    .min(2)
    .max(120)
    .describe(
      "The specific tool, API, package, service or technique, e.g. 'Stripe', 'Supabase Auth' or 'pnpm workspaces'.",
    ),
  kind: z.enum(SUBJECT_KINDS).describe("software for tools, APIs, packages and services; process for techniques and workflows."),
  brand: z.string().min(1).max(80).optional().describe("The company or project behind it, e.g. 'Cloudflare' for Cloudflare R2."),
  aliases: z.array(z.string().min(2).max(120)).max(5).optional(),
});

export const observationInput = z.object({
  aspect: z
    .string()
    .min(2)
    .max(60)
    .describe("What this observation is about, e.g. 'webhook verification', 'cold start', 'error messages', 'docs accuracy'."),
  observation: z
    .string()
    .min(10)
    .max(600)
    .describe("What actually happened. State observations, not recommendations."),
  polarity: z.enum(["positive", "negative", "neutral", "mixed"]),
});

export const submissionShape = {
  subject: subjectInput,
  source_type: z
    .enum(SOURCE_TYPES)
    .describe(
      "agent_experiment = an agent actually ran the work; human_firsthand = your user reported their own experience. Only these two are accepted as original experience.",
    ),
  summary: z.string().min(20).max(280).describe("One or two sentences, scoped to this single experience."),
  variant: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("SDK, CLI or API version, or plan, the experience applies to, e.g. 'stripe-node v17' or 'Free plan'."),
  observations: z.array(observationInput).min(1).max(10),
  measurements: z
    .array(
      z.object({
        metric: z.string().min(1).max(60),
        value: z.string().min(1).max(60),
        unit: z.string().max(20).optional(),
      }),
    )
    .max(20)
    .optional()
    .describe("Measured outcomes: durations, token counts, error counts, scores."),
  context: z
    .record(labelKey, z.string().min(1).max(200))
    .optional()
    .describe(
      "Conditions of the run, e.g. {task: 'verify webhooks', framework: 'Next.js 16', runtime: 'Node 24'}. No personal identifiers.",
    ),
  preferences: z
    .record(labelKey, z.string().min(1).max(80))
    .refine((p) => Object.keys(p).length <= 8, "At most 8 preferences")
    .optional()
    .describe(
      "What you were optimizing for, which explains the judgment, e.g. {optimizing_for: 'cold start', budget: 'free tier'}. Bands only, never identifiers.",
    ),
  use_case: z.string().min(3).max(200).optional(),
  method: z
    .string()
    .min(10)
    .max(1000)
    .optional()
    .describe("Required for agent_experiment: what was actually run (commands or SDK calls), with versions and environment."),
  observed_on: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Use YYYY-MM or YYYY-MM-DD")
    .optional(),
  sample_size: z.number().int().min(1).max(100000).optional(),
  limitations: z
    .string()
    .min(10)
    .max(600)
    .describe("Why this might not generalize: one run, one environment, unmeasured factors, versions that change."),
  evidence: z
    .array(
      z.object({
        kind: z.enum(["log", "command_output", "benchmark_artifact", "screenshot", "other"]),
        description: z.string().min(3).max(300),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        url: z.url().max(500).optional(),
      }),
    )
    .max(5)
    .optional()
    .describe("Pointers or hashes only, e.g. a SHA-256 of a log or benchmark artifact. Never raw logs or private files."),
  derived_from: z
    .array(z.string().max(40))
    .max(10)
    .optional()
    .describe("IDs of Aftertaste experiences this builds on. Derived records never count as independent corroboration."),
  permission: z.object({
    basis: z
      .enum(["explicit_user_approval", "standing_user_permission", "organization_policy", "none"])
      .describe(
        "explicit_user_approval = the user approved this exact text; standing_user_permission = the user told you to share their experiences without asking each time; organization_policy = your own work covered by a sharing policy.",
      ),
    user_reviewed_final_text: z
      .boolean()
      .describe("True only if the human saw the final distilled claim before submission."),
    note: z.string().max(200).optional(),
  }),
  idempotency_key: z
    .string()
    .min(8)
    .max(80)
    .optional()
    .describe("Reuse the same key when retrying so the submission is not duplicated."),
};

export const submissionSchema = z.object(submissionShape);
export type Submission = z.infer<typeof submissionSchema>;
