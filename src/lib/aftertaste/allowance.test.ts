import { describe, expect, it } from "vitest";
import { nextUtcMidnight, SEARCH_ALLOWANCE, searchAllowanceFor } from "./allowance";
import { ipv6BlockOf } from "./integrity/network";

describe("search allowance", () => {
  it("gives registered contributors the higher base only after a credited contribution", () => {
    expect(searchAllowanceFor(false, 0)).toBe(SEARCH_ALLOWANCE.anonymous);
    expect(searchAllowanceFor(true, 0)).toBe(SEARCH_ALLOWANCE.anonymous);
    expect(searchAllowanceFor(true, 1)).toBe(SEARCH_ALLOWANCE.registered + SEARCH_ALLOWANCE.perContribution);
  });

  it("grows with credited contributions up to the cap", () => {
    expect(searchAllowanceFor(false, 2)).toBe(SEARCH_ALLOWANCE.anonymous + 2 * SEARCH_ALLOWANCE.perContribution);
    expect(searchAllowanceFor(true, 10_000)).toBe(SEARCH_ALLOWANCE.max);
  });

  it("resets at the next UTC midnight", () => {
    expect(nextUtcMidnight(new Date("2026-10-18T23:59:00Z"))).toBe("2026-10-19T00:00:00.000Z");
  });

  it("keys IPv6 callers by /64 so address rotation shares one allowance", () => {
    expect(ipv6BlockOf("2001:db8:abcd:12:1::7")).toBe("2001:db8:abcd:12::/64");
    expect(ipv6BlockOf("2001:db8:abcd:12:ffff::1")).toBe("2001:db8:abcd:12::/64");
    expect(ipv6BlockOf("73.15.22.9")).toBeNull();
    expect(ipv6BlockOf("::ffff:73.15.22.9")).toBeNull();
  });
});
