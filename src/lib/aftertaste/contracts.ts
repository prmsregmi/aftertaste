import { z } from "zod";

export const SUBJECT_KINDS = [
  "physical_product",
  "software",
  "place",
  "process",
  "service",
  "other",
] as const;

export const SOURCE_TYPES = [
  "human_firsthand",
  "agent_experiment",
  "official_source_reference",
  "secondhand_summary",
] as const;

// Keys of free-form maps are short snake_case labels, so they can't carry free text.
const labelKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a short snake_case label like usual_size");

export const subjectInput = z.object({
  name: z
    .string()
    .min(2)
    .max(120)
    .describe(
      "Specific name of the thing experienced, including brand and model where relevant, e.g. 'Canyon Grail CF SL bicycle' or 'El Cerrito DMV motorcycle skills test'. Avoid bare brand names.",
    ),
  kind: z.enum(SUBJECT_KINDS),
  brand: z.string().min(1).max(80).optional(),
  location: z
    .string()
    .min(2)
    .max(160)
    .optional()
    .describe("Public place or city for places and local processes. Never a private address."),
  aliases: z.array(z.string().min(2).max(120)).max(5).optional(),
});

export const observationInput = z.object({
  aspect: z
    .string()
    .min(2)
    .max(60)
    .describe("What this observation is about, e.g. 'fit', 'adjustability', 'course direction', 'render time'."),
  observation: z
    .string()
    .min(10)
    .max(600)
    .describe("What was actually observed. State observations, not recommendations."),
  polarity: z.enum(["positive", "negative", "neutral", "mixed"]),
});

export const submissionShape = {
  subject: subjectInput,
  source_type: z
    .enum(SOURCE_TYPES)
    .describe(
      "human_firsthand = a person reported their own experience; agent_experiment = an agent actually ran the work. Only these two are accepted as original experience.",
    ),
  summary: z.string().min(20).max(280).describe("One or two sentences, scoped to this single experience."),
  variant: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Size, trim, plan, edition or software version the experience applies to, e.g. 'size S' or 'v2.3.0'."),
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
    .describe("Measured outcomes for agent experiments: durations, token counts, error rates, scores."),
  context: z
    .record(labelKey, z.string().min(1).max(200))
    .optional()
    .describe(
      "Conditions of the experience itself, e.g. {size_worn: 'S'} or {os: 'macOS 26', node: '22.22'}. No personal identifiers.",
    ),
  preferences: z
    .record(labelKey, z.string().min(1).max(80))
    .refine((p) => Object.keys(p).length <= 8, "At most 8 preferences")
    .optional()
    .describe(
      "Use instead of identity: the reviewer's coarse preferences that explain the judgment, e.g. {usual_size: 'M', budget: 'mid-range', noise_tolerance: 'low'} or for agents {optimizing_for: 'build time'}. Bands and ranges only; never names, exact ages, locations or health details.",
    ),
  use_case: z.string().min(3).max(200).optional(),
  method: z
    .string()
    .min(10)
    .max(1000)
    .optional()
    .describe("Required for agent_experiment: what was actually run, with tool versions and environment."),
  observed_on: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Use YYYY-MM or YYYY-MM-DD")
    .optional(),
  sample_size: z.number().int().min(1).max(100000).optional(),
  limitations: z
    .string()
    .min(10)
    .max(600)
    .describe("Why this might not generalize: one person, one environment, unmeasured factors, rules that change."),
  evidence: z
    .array(
      z.object({
        kind: z.enum(["receipt", "photo", "log", "command_output", "benchmark_artifact", "other"]),
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
    .describe("Pointers or hashes only. Never upload raw receipts, order numbers or private logs."),
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
