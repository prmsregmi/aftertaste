import { describe, expect, it } from "vitest";
import { submissionSchema, type Submission } from "./contracts";
import { evaluateSubmission } from "./evaluate";

const jacket: Submission = submissionSchema.parse({
  subject: { name: "Canyon motorcycle jacket", kind: "physical_product", brand: "Canyon" },
  source_type: "human_firsthand",
  summary: "Overall good jacket; in size S the body length runs a little short and the rear adjustment strap stays loose.",
  variant: "size S",
  observations: [
    { aspect: "length", observation: "Body length in size S felt a little short for this wearer.", polarity: "negative" },
    { aspect: "adjustability", observation: "Rear back adjustment strap stays loose even when cinched.", polarity: "negative" },
  ],
  context: { size_worn: "S" },
  observed_on: "2026-10",
  limitations: "One person's fit impression in one size; body shape and layering differ.",
  permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
});

describe("evaluateSubmission", () => {
  it("publishes a scoped, approved firsthand report", () => {
    const result = evaluateSubmission(jacket);
    expect(result.status).toBe("published");
    expect(result.reasonCodes).toEqual([]);
  });

  it("rejects promotional spam with sweeping claims and tracking links", () => {
    const result = evaluateSubmission({
      ...jacket,
      summary: "Every Canyon jacket is defective! Five stars! Buy at this affiliate URL!",
      observations: [
        { aspect: "quality", observation: "BEST DEAL EVER https://example.com/j?ref=abc123", polarity: "positive" },
      ],
    });
    expect(result.status).toBe("rejected");
    expect(result.reasonCodes).toContain("promotional_spam");
  });

  it("redacts and rejects personal data", () => {
    const result = evaluateSubmission({
      ...jacket,
      limitations: "Contact me at jane.doe@example.com or 510-555-1234 about order #A12345678.",
    });
    expect(result.status).toBe("rejected");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["contains_personal_data", "contains_transaction_id"]),
    );
    expect(result.redacted.limitations).not.toMatch(/jane|555|A12345678/);
  });

  it("redacts personal data in every stored field, including subject and context keys", () => {
    const result = evaluateSubmission({
      ...jacket,
      subject: { ...jacket.subject, location: "call 510-555-1234" },
      context: { "owner jane.doe@example.com": "S" },
      measurements: [{ metric: "contact", value: "1", unit: "a@b.co" }],
    });
    expect(result.status).toBe("rejected");
    expect(JSON.stringify(result.redacted)).not.toMatch(/555|jane|a@b\.co/);
  });

  it("treats tracking links in evidence URLs as spam", () => {
    const result = evaluateSubmission({
      ...jacket,
      evidence: [{ kind: "receipt", description: "store page", url: "https://shop.example/j?ref=aff1" }],
    });
    expect(result.reasonCodes).toContain("promotional_spam");
  });

  it("does not mistake ordinary words after 'order' for an order ID", () => {
    expect(evaluateSubmission({ ...jacket, use_case: "Ordered online in order tracking season" }).status).toBe(
      "published",
    );
  });

  it("rejects secrets in agent logs", () => {
    const result = evaluateSubmission({
      ...jacket,
      source_type: "agent_experiment",
      method: "Ran the build with OPENAI key sk-abcdefghijklmnopqrstuvwx in env",
    });
    expect(result.reasonCodes).toContain("contains_secret");
    expect(result.redacted.method).toContain("[REDACTED_SECRET]");
  });

  it("rejects secondhand summaries as non-original", () => {
    expect(evaluateSubmission({ ...jacket, source_type: "secondhand_summary" }).status).toBe("rejected");
  });

  it("asks for consent when the user did not review the final text", () => {
    const result = evaluateSubmission({
      ...jacket,
      permission: { basis: "explicit_user_approval", user_reviewed_final_text: false },
    });
    expect(result.status).toBe("needs_consent");
  });

  it("accepts standing user permission without a per-claim review", () => {
    const result = evaluateSubmission({
      ...jacket,
      permission: { basis: "standing_user_permission", user_reviewed_final_text: false },
    });
    expect(result.status).toBe("published");
  });

  it("redacts personal data inside reviewer preferences", () => {
    const result = evaluateSubmission({ ...jacket, preferences: { contact: "jane.doe@example.com", usual_size: "M" } });
    expect(result.status).toBe("rejected");
    expect(result.redacted.preferences?.contact).toBe("[REDACTED_EMAIL]");
    expect(result.redacted.preferences?.usual_size).toBe("M");
  });

  it("holds agent experiments that omit the method", () => {
    const result = evaluateSubmission({ ...jacket, source_type: "agent_experiment" });
    expect(result.status).toBe("pending_review");
    expect(result.reasonCodes).toContain("insufficient_experiment_detail");
  });
});
