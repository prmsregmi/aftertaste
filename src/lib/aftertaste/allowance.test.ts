import { describe, expect, it } from "vitest";
import { nextUtcMidnight, SEARCH_ALLOWANCE, searchAllowanceFor } from "./allowance";

describe("search allowance", () => {
  it("grows with credited contributions up to the cap", () => {
    expect(searchAllowanceFor(0)).toBe(SEARCH_ALLOWANCE.base);
    expect(searchAllowanceFor(2)).toBe(SEARCH_ALLOWANCE.base + 2 * SEARCH_ALLOWANCE.perContribution);
    expect(searchAllowanceFor(10_000)).toBe(SEARCH_ALLOWANCE.max);
  });

  it("resets at the next UTC midnight", () => {
    expect(nextUtcMidnight(new Date("2026-10-18T23:59:00Z"))).toBe("2026-10-19T00:00:00.000Z");
  });
});
