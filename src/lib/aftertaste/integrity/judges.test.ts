import { describe, expect, it } from "vitest";
import { submissionSchema } from "../contracts";
import { screenContent, type Providers } from "./judges";
import { decideContent, fuse, needsEscalation, QUESTION_KEYS, voteProbabilities, type Verdict } from "./rubric";

const record = submissionSchema.parse({
  subject: { name: "Nopa", kind: "place", location: "San Francisco" },
  source_type: "human_firsthand",
  summary: "Dinner for two on a Friday; the wood-fired pork chop was excellent but the room was loud.",
  observations: [
    { aspect: "food", observation: "The pork chop was juicy and well seasoned.", polarity: "positive" },
    { aspect: "noise", observation: "Hard to talk across the table at 8pm.", polarity: "negative" },
  ],
  observed_on: "2026-10",
  limitations: "One visit on a busy night.",
  permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
});

const verdict = (yes: string[] = [], unsure: string[] = []): Verdict =>
  Object.fromEntries(
    QUESTION_KEYS.map((q) => [q, { answer: yes.includes(q) ? "yes" : unsure.includes(q) ? "unsure" : "no", evidence: "" }]),
  ) as Verdict;

describe("rubric fusion", () => {
  it("turns votes into probabilities", () => {
    const p = voteProbabilities([verdict(["promotional"]), verdict(["promotional"]), verdict([], ["promotional"])]);
    expect(p.promotional).toBeCloseTo(2.5 / 3);
    expect(p.grudge_or_targeting).toBe(0);
  });

  it("lets moderation raise but never lower the harassment estimate", () => {
    const primary = voteProbabilities([verdict()]);
    const fused = fuse({ primary, second: null, escalation: null, moderation: { harassment: 0.95 } });
    expect(fused!.harassment_or_hate).toBe(0.95);
  });

  it("escalates disagreement and uncertainty, not agreement", () => {
    const clean = voteProbabilities([verdict()]);
    const promo = voteProbabilities([verdict(["promotional"])]);
    expect(needsEscalation(clean, clean)).toBe(false);
    expect(needsEscalation(clean, promo)).toBe(true);
    expect(needsEscalation(voteProbabilities([verdict([], ["fabricated_or_implausible"])]), null)).toBe(true);
  });

  it("rejects only near-certain harms and holds the merely likely", () => {
    const p = voteProbabilities([verdict()]);
    expect(decideContent({ ...p, instructions_to_ai: 0.9 }).outcome).toBe("reject");
    expect(decideContent({ ...p, grudge_or_targeting: 0.95 }).outcome).toBe("hold");
    expect(decideContent({ ...p, promotional: 0.6 }).outcome).toBe("hold");
    expect(decideContent(p).outcome).toBe("pass");
  });
});

describe("screenContent", () => {
  it("is a no-op when no provider is configured", async () => {
    const result = await screenContent(record, {});
    expect(result).toMatchObject({ configured: false, complete: true, decision: null });
  });

  it("passes a clean record without escalating", async () => {
    let escalated = 0;
    const providers: Providers = {
      judge: async () => verdict(),
      second: async () => verdict(),
      escalate: async () => {
        escalated++;
        return verdict();
      },
      moderate: async () => ({ harassment: 0.01 }),
      embed: async () => [0.1, 0.2],
    };
    const result = await screenContent(record, providers);
    expect(result.decision?.outcome).toBe("pass");
    expect(result.complete).toBe(true);
    expect(escalated).toBe(0);
    expect(result.embedding).toEqual([0.1, 0.2]);
    expect(result.layers.find((l) => l.layer === "embedding")?.result).toEqual({ dimensions: 2 });
  });

  it("escalates a disputed record and follows the stronger judge", async () => {
    const result = await screenContent(record, {
      judge: async () => verdict(["promotional"]),
      second: async () => verdict(),
      escalate: async () => verdict(["promotional"]),
    });
    expect(result.layers.some((l) => l.layer === "escalation")).toBe(true);
    expect(result.probabilities!.promotional).toBeGreaterThan(0.7);
    expect(result.decision?.outcome).toBe("hold");
  });

  it("marks screening incomplete when the primary judge fails", async () => {
    const result = await screenContent(record, {
      judge: async () => {
        throw new Error("overloaded");
      },
      moderate: async () => ({}),
    });
    expect(result.complete).toBe(false);
    expect(result.layers.filter((l) => (l.result as { error?: string }).error)).toHaveLength(3);
  });

  it("stays complete when only a supporting layer fails", async () => {
    const result = await screenContent(record, {
      judge: async () => verdict(),
      second: async () => {
        throw new Error("unsupported schema");
      },
    });
    expect(result.complete).toBe(true);
    expect(result.decision?.outcome).toBe("pass");
  });
});
