// Statistics for coordinated manipulation. Pure, so thresholds can be tested and tuned offline.
// Sources: Poisson burst tests and polarity shifts (Steam review-bomb windows, BIRDNEST), lockstep
// groups (CopyCatch, GSRank), Beta reputation with forgetting (Jøsang & Ismail 2002).
import type { Observation } from "@/db/schema";

export type Polarity = "positive" | "negative" | "mixed";

export function recordPolarity(observations: Pick<Observation, "polarity">[]): Polarity {
  let score = 0;
  for (const o of observations) score += o.polarity === "positive" ? 1 : o.polarity === "negative" ? -1 : 0;
  return score > 0 ? "positive" : score < 0 ? "negative" : "mixed";
}

function logFactorial(n: number) {
  let acc = 0;
  for (let i = 2; i <= n; i++) acc += Math.log(i);
  return acc;
}

// P(X >= k) for X ~ Poisson(lambda), summed in log space.
export function poissonTail(k: number, lambda: number): number {
  if (k <= 0) return 1;
  if (lambda <= 0) return 0;
  let below = 0;
  for (let i = 0; i < k; i++) below += Math.exp(-lambda + i * Math.log(lambda) - logFactorial(i));
  return Math.max(0, Math.min(1, 1 - below));
}

// P(X >= k) for X ~ Binomial(n, p).
export function binomialTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let tail = 0;
  for (let i = k; i <= n; i++) {
    tail += Math.exp(
      logFactorial(n) - logFactorial(i) - logFactorial(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p),
    );
  }
  return Math.min(1, tail);
}

export const BURST = { windowHours: 24, baselineDays: 28, priorDays: 7, minCount: 5, pValue: 1e-4, floor: 0.2 };

// Daily rate for one subject and polarity: its own 28-day history shrunk toward the platform-wide
// per-subject rate, so a quiet new subject isn't judged on a baseline of zero.
export function expectedDaily(baselineCount: number, globalDailyPerSubject: number) {
  const rate = (baselineCount + BURST.priorDays * globalDailyPerSubject) / (BURST.baselineDays + BURST.priorDays);
  return Math.max(BURST.floor, rate);
}

export function isBurst(windowCount: number, lambda: number) {
  const p = poissonTail(windowCount, lambda);
  return { burst: windowCount >= BURST.minCount && p < BURST.pValue, p };
}

export const SHIFT = { minCount: 5, minJump: 0.3, pValue: 1e-3 };

// A jump in one polarity's share against the subject's history (Laplace-smoothed).
export function polarityShift(windowPolar: number, windowTotal: number, baselinePolar: number, baselineTotal: number) {
  const p0 = (baselinePolar + 1) / (baselineTotal + 2);
  const share = windowTotal ? windowPolar / windowTotal : 0;
  const p = binomialTail(windowPolar, windowTotal, p0);
  return {
    shift: windowTotal >= SHIFT.minCount && share - p0 >= SHIFT.minJump && p < SHIFT.pValue,
    p,
    share,
    baselineShare: p0,
  };
}

export type LockstepPair = {
  a: string;
  b: string;
  sharedSubjects: number;
  // Mean hours between the two submitters' records on their shared subjects.
  meanGapHours: number;
  textSimilarity: number;
};

// Connected components over submitter pairs that hit the same subjects together.
export function lockstepGroups(pairs: LockstepPair[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const { a, b } of pairs) {
    parent.set(a, find(a));
    parent.set(b, find(b));
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const key of parent.keys()) {
    const root = find(key);
    groups.set(root, [...(groups.get(root) ?? []), key]);
  }
  return [...groups.values()].map((g) => g.sort()).sort((x, y) => y.length - x.length);
}

export const LOCKSTEP = { maxGapHours: 72, minSharedSubjects: 3, flagScore: 0.5, quarantineScore: 0.75 };

export type GroupIndicators = {
  size: number;
  meanGapHours: number;
  textSimilarity: number;
  // Share of the targeted subjects' records (in the window) that came from the group.
  subjectShare: number;
  // Share of members whose first record is recent.
  newMemberShare: number;
};

// GSRank-style group spam score in [0, 1]: tight timing, copied text, dominance over the targets,
// fresh accounts and group size each add evidence.
export function groupScore(g: GroupIndicators): number {
  const tightness = Math.max(0, 1 - g.meanGapHours / LOCKSTEP.maxGapHours);
  const size = Math.min(1, (g.size - 1) / 4);
  return (
    0.25 * tightness +
    0.2 * Math.min(1, g.textSimilarity / 0.6) +
    0.25 * g.subjectShare +
    0.15 * g.newMemberShare +
    0.15 * size
  );
}

export const TRUST = { weeklyForgetting: 0.98, verifiedBonus: 2 };

export const decay = (ageWeeks: number) => TRUST.weeklyForgetting ** Math.max(0, ageWeeks);

// Beta reputation: expected probability that this submitter's next record holds up.
export function betaTrust(good: number, bad: number, verified: boolean) {
  const alpha = 1 + good + (verified ? TRUST.verifiedBonus : 0);
  const beta = 1 + bad;
  return { alpha, beta, trust: alpha / (alpha + beta) };
}

export type WeightInput = {
  trust: number;
  contentRisk: number | null;
  anomaly: "none" | "detected" | "confirmed";
  newAccount: boolean;
};

// Ranking weight in [0, 1]. Records are down-weighted rather than deleted, so a false positive costs
// visibility, not existence; confirmed manipulation drops to zero and leaves search.
export function recordWeight(w: WeightInput): number {
  if (w.anomaly === "confirmed") return 0;
  const trustFactor = Math.min(1, 0.4 + w.trust);
  const contentFactor = 1 - 0.8 * (w.contentRisk ?? 0);
  const anomalyFactor = w.anomaly === "detected" ? 0.3 : 1;
  const newFactor = w.newAccount ? 0.7 : 1;
  const weight = trustFactor * contentFactor * anomalyFactor * newFactor;
  return Math.round(Math.max(0.02, Math.min(1, weight)) * 1000) / 1000;
}
