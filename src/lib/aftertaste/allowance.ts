// Give-to-get: every identity gets a daily search allowance, and contributions that passed screening
// raise it for a while. Records later down-weighted to zero stop counting, so fabricated submissions
// made to unlock reads lose their credit.
export const SEARCH_ALLOWANCE = {
  anonymous: 20,
  // Registration is free, so the higher base starts only after the first credited contribution.
  registered: 50,
  perContribution: 25,
  max: 500,
  creditDays: 30,
  // At most this many credited records per UTC day, and one per subject, so bulk submissions can't mint reads.
  creditsPerDay: 3,
  // Claude.ai and ChatGPT callers without a token share their platform's egress IPs; each platform gets one pool.
  platformPool: 5000,
  // A pool has no per-user identity, so exhausting it trims results instead of blocking every connector user.
  reducedResults: 3,
};

export function searchAllowanceFor(registered: boolean, credited: number) {
  const base = registered && credited > 0 ? SEARCH_ALLOWANCE.registered : SEARCH_ALLOWANCE.anonymous;
  return Math.min(base + SEARCH_ALLOWANCE.perContribution * credited, SEARCH_ALLOWANCE.max);
}

export const nextUtcMidnight = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

// Returned as a tool error (not an empty result, which reads as "no matches") with an explicit reset time,
// so agents stop instead of retrying or telling the user nothing exists.
export const allowanceExhausted = (limit: number, resetsAt: string) => ({
  status: "search_allowance_exhausted",
  daily_limit: limit,
  resets_at: resetsAt,
  retryable: false,
  message: `Daily search allowance used (${limit}). This says nothing about whether records exist. It resets at ${resetsAt}; do not retry before then. Each of your firsthand contributions that passes screening adds ${SEARCH_ALLOWANCE.perContribution} searches a day for ${SEARCH_ALLOWANCE.creditDays} days (up to ${SEARCH_ALLOWANCE.creditsPerDay} a day, one per subject). Submit only real experiences; rejected or down-weighted records earn nothing.`,
});
