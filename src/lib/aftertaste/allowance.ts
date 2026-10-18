// Give-to-get: every identity gets a daily search allowance, and contributions that passed screening
// raise it for a while. Records later down-weighted to zero stop counting, so fabricated submissions
// made to unlock reads lose their credit.
export const SEARCH_ALLOWANCE = { anonymous: 20, registered: 50, perContribution: 25, max: 500, creditDays: 30 };

export function searchAllowanceFor(registered: boolean, acceptedContributions: number) {
  const base = registered ? SEARCH_ALLOWANCE.registered : SEARCH_ALLOWANCE.anonymous;
  return Math.min(base + SEARCH_ALLOWANCE.perContribution * acceptedContributions, SEARCH_ALLOWANCE.max);
}

// Returned as a normal result, not an error, so agents stop instead of retrying. It states the reset
// time and the one way to raise the limit.
export const allowanceUsedNote = (limit: number) =>
  `Daily search allowance used (${limit}). It resets at 00:00 UTC. Each of your firsthand contributions that passes screening adds ${SEARCH_ALLOWANCE.perContribution} searches a day for ${SEARCH_ALLOWANCE.creditDays} days; submit only real experiences, since rejected or down-weighted records earn nothing. Do not retry this search today.`;
