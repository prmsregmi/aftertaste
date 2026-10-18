import { Experimental_DecisionMockModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { submissionSchema } from "../contracts";
import { chunkText, decideRecord, injectionText, screenContent, type Providers } from "./classifiers";
import { decideContent, fuse, QUESTION_KEYS, type Probabilities, type Question } from "./rubric";

const record = submissionSchema.parse({
  subject: { name: "Supabase Auth", kind: "software", brand: "Supabase" },
  source_type: "human_firsthand",
  summary: "Added email login to a Next.js app; session refresh worked, but the local setup was slow and the docs were out of date.",
  observations: [
    { aspect: "session refresh", observation: "The refresh token rotated cleanly across tabs.", polarity: "positive" },
    { aspect: "docs accuracy", observation: "The quickstart still used the deprecated helper package.", polarity: "negative" },
  ],
  context: { framework: "Next.js 16" },
  observed_on: "2026-10",
  limitations: "One small app on the free plan.",
  permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
});

const probs = (yes: Partial<Probabilities> = {}): Probabilities =>
  ({ ...Object.fromEntries(QUESTION_KEYS.map((q) => [q, 0.02])), ...yes }) as Probabilities;

const decision = (yes: Partial<Probabilities> = {}) => async () => ({ probabilities: probs(yes), model: "jev" });

describe("rubric fusion", () => {
  it("keeps the decision model's probabilities when no specialist ran", () => {
    expect(fuse({ decision: probs({ promotional: 0.8 }), injection: null })).toEqual(probs({ promotional: 0.8 }));
    expect(fuse({ decision: null, injection: null })).toBeNull();
  });

  it("lets the injection classifier raise but never lower its harm", () => {
    expect(fuse({ decision: probs({ instructions_to_ai: 0.6 }), injection: 0.97 })!.instructions_to_ai).toBe(0.97);
    expect(fuse({ decision: probs({ instructions_to_ai: 0.6 }), injection: 0.01 })!.instructions_to_ai).toBe(0.6);
  });

  it("rejects only near-certain harms and holds the merely likely", () => {
    expect(decideContent(probs({ instructions_to_ai: 0.9 })).outcome).toBe("reject");
    expect(decideContent(probs({ grudge_or_targeting: 0.95 })).outcome).toBe("hold");
    expect(decideContent(probs({ promotional: 0.6 })).outcome).toBe("hold");
    expect(decideContent(probs()).outcome).toBe("pass");
  });
});

describe("decideRecord", () => {
  it("asks every question as a boolean and maps the answers to probabilities", async () => {
    let call: Parameters<Experimental_DecisionMockModelV4["doDecide"]>[0] | undefined;
    const model = new Experimental_DecisionMockModelV4({
      modelId: "jev-test",
      doDecide: async (options) => {
        call = options;
        return {
          answers: Object.fromEntries(
            Object.keys(options.questions).map((q) => [q, { type: "boolean", probability: q === "promotional" ? 0.91 : 0.03 }]),
          ),
          response: { modelId: "jev-test" },
          warnings: [],
        };
      },
    });
    const { probabilities, model: answeredBy } = await decideRecord(record, AbortSignal.timeout(1000), model);
    expect(Object.keys(call!.questions).sort()).toEqual([...QUESTION_KEYS].sort());
    expect(Object.values(call!.questions).every((q) => q.type === "boolean")).toBe(true);
    expect(call!.providerOptions?.gateway).toEqual({
      models: [{ model: "openai/gpt-6-luna-decisions", when: { probabilityBetween: [0.3, 0.7] } }],
    });
    expect(probabilities).toEqual(probs({ promotional: 0.91, ...Object.fromEntries(QUESTION_KEYS.filter((q) => q !== "promotional").map((q) => [q, 0.03])) }));
    expect(answeredBy).toBe("jev-test");
  });
});

describe("prompt-injection input", () => {
  it("covers every free-text field the decision model reads", () => {
    const text = injectionText(record);
    for (const part of ["Supabase Auth", "refresh token", "deprecated helper", "Next.js 16", "free plan"]) expect(text).toContain(part);
  });

  it("splits long text into overlapping windows", () => {
    expect(chunkText("short")).toEqual(["short"]);
    const chunks = chunkText("x".repeat(3000), 1500, 200);
    expect(chunks.map((c) => c.length)).toEqual([1500, 1500, 400]);
  });
});

describe("screenContent", () => {
  it("is incomplete when no provider is configured, so the record is held", async () => {
    const result = await screenContent(record, {});
    expect(result).toMatchObject({ configured: false, complete: false, decision: null });
  });

  it("passes a clean record and logs every layer", async () => {
    const providers: Providers = {
      decide: decision(),
      detectInjection: async () => 0.01,
      embed: async () => [0.1, 0.2],
    };
    const result = await screenContent(record, providers);
    expect(result.decision?.outcome).toBe("pass");
    expect(result.complete).toBe(true);
    expect(result.embedding).toEqual([0.1, 0.2]);
    expect(result.layers.map((l) => l.layer).sort()).toEqual(["decision", "embedding", "prompt_injection"]);
    expect(result.layers.find((l) => l.layer === "embedding")?.result).toEqual({ dimensions: 2 });
  });

  it("rejects when the injection classifier is near-certain, whatever the decision model says", async () => {
    const result = await screenContent(record, { decide: decision(), detectInjection: async () => 0.99 });
    expect(result.decision).toMatchObject({ outcome: "reject", reasons: ["instructions_to_ai" satisfies Question] });
  });

  it("marks screening incomplete when the decision model fails", async () => {
    const result = await screenContent(record, {
      decide: async () => {
        throw new Error("overloaded");
      },
      detectInjection: async () => 0.01,
    });
    expect(result.complete).toBe(false);
    expect(result.layers.filter((l) => (l.result as { error?: string }).error)).toHaveLength(1);
  });

  it("is incomplete without a decision model even when the other classifiers answer", async () => {
    const result = await screenContent(record, { detectInjection: async () => 0.01 });
    expect(result.complete).toBe(false);
  });

  it("stays complete when only a supporting classifier fails", async () => {
    const result = await screenContent(record, {
      decide: decision(),
      detectInjection: async () => {
        throw new Error("prompt guard HTTP 503");
      },
    });
    expect(result.complete).toBe(true);
    expect(result.decision?.outcome).toBe("pass");
  });
});
