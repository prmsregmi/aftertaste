import { describe, expect, it } from "vitest";
import {
  betaTrust,
  binomialTail,
  expectedDaily,
  groupScore,
  isBurst,
  lockstepGroups,
  poissonTail,
  polarityShift,
  recordPolarity,
  recordWeight,
} from "./behavior";

describe("tail probabilities", () => {
  it("matches known Poisson values", () => {
    expect(poissonTail(0, 3)).toBe(1);
    expect(poissonTail(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(poissonTail(10, 1)).toBeLessThan(1e-6);
  });

  it("matches known binomial values", () => {
    expect(binomialTail(5, 5, 0.5)).toBeCloseTo(1 / 32, 10);
    expect(binomialTail(0, 5, 0.5)).toBe(1);
    expect(binomialTail(6, 5, 0.5)).toBe(0);
  });
});

describe("burst detection", () => {
  it("flags twelve negative records in a day on a quiet subject", () => {
    const lambda = expectedDaily(4, 0.1);
    expect(isBurst(12, lambda).burst).toBe(true);
  });

  it("ignores ordinary daily volume on a busy subject", () => {
    const lambda = expectedDaily(28 * 6, 0.1);
    expect(isBurst(8, lambda).burst).toBe(false);
  });

  it("needs at least five records", () => {
    expect(isBurst(4, 0.2).burst).toBe(false);
  });

  it("detects a swing from mostly positive to mostly negative", () => {
    expect(polarityShift(9, 10, 3, 40).shift).toBe(true);
    expect(polarityShift(3, 10, 12, 40).shift).toBe(false);
  });
});

describe("lockstep groups", () => {
  it("joins pairs into connected groups", () => {
    const pair = (a: string, b: string) => ({ a, b, sharedSubjects: 3, meanGapHours: 2, textSimilarity: 0.5 });
    const groups = lockstepGroups([pair("a", "b"), pair("b", "c"), pair("x", "y")]);
    expect(groups).toEqual([["a", "b", "c"], ["x", "y"]]);
  });

  it("scores a tight ring of new accounts above an incidental overlap", () => {
    const ring = groupScore({ size: 6, meanGapHours: 3, textSimilarity: 0.55, subjectShare: 0.8, newMemberShare: 1 });
    const overlap = groupScore({ size: 2, meanGapHours: 60, textSimilarity: 0.1, subjectShare: 0.05, newMemberShare: 0 });
    expect(ring).toBeGreaterThan(0.75);
    expect(overlap).toBeLessThan(0.5);
  });
});

describe("trust and weights", () => {
  it("starts neutral and rewards records that hold up", () => {
    expect(betaTrust(0, 0, false).trust).toBe(0.5);
    expect(betaTrust(8, 0, false).trust).toBeGreaterThan(0.85);
    expect(betaTrust(0, 3, false).trust).toBeLessThan(0.25);
    expect(betaTrust(0, 0, true).trust).toBeGreaterThan(0.5);
  });

  it("down-weights instead of deleting, and zeroes only confirmed manipulation", () => {
    const base = { trust: 0.5, contentRisk: 0, anomaly: "none" as const, newAccount: false };
    expect(recordWeight(base)).toBeCloseTo(0.9, 3);
    expect(recordWeight({ ...base, trust: 0.9 })).toBe(1);
    expect(recordWeight({ ...base, anomaly: "detected" })).toBeLessThan(0.3);
    expect(recordWeight({ ...base, anomaly: "confirmed" })).toBe(0);
    expect(recordWeight({ ...base, contentRisk: 1, anomaly: "detected", newAccount: true })).toBe(0.038);
  });

  it("derives a record's overall polarity from its observations", () => {
    expect(recordPolarity([{ polarity: "negative" }, { polarity: "negative" }, { polarity: "positive" }])).toBe("negative");
    expect(recordPolarity([{ polarity: "positive" }, { polarity: "negative" }])).toBe("mixed");
  });
});
