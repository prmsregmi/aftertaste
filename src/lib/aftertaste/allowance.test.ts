import { describe, expect, it } from "vitest";
import { SEARCH_ALLOWANCE, searchAllowanceFor } from "./allowance";

describe("search allowance", () => {
  it("starts registered contributors above anonymous callers", () => {
    expect(searchAllowanceFor(false, 0)).toBe(SEARCH_ALLOWANCE.anonymous);
    expect(searchAllowanceFor(true, 0)).toBe(SEARCH_ALLOWANCE.registered);
  });

  it("grows with accepted contributions up to the cap", () => {
    expect(searchAllowanceFor(true, 2)).toBe(SEARCH_ALLOWANCE.registered + 2 * SEARCH_ALLOWANCE.perContribution);
    expect(searchAllowanceFor(true, 10_000)).toBe(SEARCH_ALLOWANCE.max);
  });
});
