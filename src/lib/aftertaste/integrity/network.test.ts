import { describe, expect, it } from "vitest";
import { headerSetOf, networkRisk, prefixOf, uaFamilyOf, type NetworkContext } from "./network";

const base: NetworkContext = {
  action: "submit",
  networkClass: "unknown",
  fingerprint: {
    ip: "203.0.113.7",
    country: "US",
    ja4: null,
    headerHash: "accept,content-type,user-agent",
    uaFamily: "claude_code",
    clientName: "claude-code",
    clientVersion: "3.1.0",
  },
  registered: true,
  tokenAgeHours: 400,
  prefixWritesLastHour: 0,
  prefixDistinctSubmittersLastDay: 1,
  prefixRegistrationsLastDay: 0,
  fingerprintRegistrationsLastDay: 0,
  acceptedHistory: 0,
};

describe("prefixes", () => {
  it("groups IPv4 by /24 and IPv6 by /48", () => {
    expect(prefixOf("203.0.113.7")).toBe("203.0.113.0/24");
    expect(prefixOf("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(prefixOf("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(prefixOf("::ffff:198.51.100.4")).toBe("198.51.100.0/24");
  });
});

describe("client fingerprint", () => {
  it("classifies common agent clients", () => {
    expect(uaFamilyOf("Claude-User (claude.ai)")).toBe("claude_connector");
    expect(uaFamilyOf("claude-code/3.1.0")).toBe("claude_code");
    expect(uaFamilyOf("python-httpx/0.28")).toBe("python");
    expect(uaFamilyOf(null)).toBe("none");
  });

  it("ignores headers added by the platform", () => {
    const h = new Headers({ "user-agent": "x", accept: "*/*", "x-vercel-ip-country": "US", "x-forwarded-for": "1.2.3.4" });
    expect(headerSetOf(h)).toBe("accept,user-agent");
  });
});

describe("network risk", () => {
  it("is low for an established client on an ordinary network", () => {
    expect(networkRisk({ ...base, acceptedHistory: 10 }).risk).toBe(0);
  });

  it("flags a Claude connector user agent outside Anthropic's egress", () => {
    const r = networkRisk({ ...base, fingerprint: { ...base.fingerprint, uaFamily: "claude_connector" } });
    expect(r.reasons).toContain("spoofed_claude_connector");
  });

  it("does not count shared platform egress as many identities on one network", () => {
    const busy = { ...base, prefixWritesLastHour: 50, prefixDistinctSubmittersLastDay: 40 };
    expect(networkRisk({ ...busy, networkClass: "platform_anthropic" }).risk).toBe(0);
    expect(networkRisk(busy).risk).toBeGreaterThanOrEqual(40);
  });

  it("blocks token farming from one network", () => {
    const r = networkRisk({
      ...base,
      action: "register",
      registered: false,
      tokenAgeHours: null,
      networkClass: "datacenter",
      prefixRegistrationsLastDay: 4,
      prefixDistinctSubmittersLastDay: 6,
    });
    expect(r.risk).toBeGreaterThanOrEqual(70);
  });

  it("adds Tor and scripted-client mismatches", () => {
    const r = networkRisk({
      ...base,
      networkClass: "tor",
      fingerprint: { ...base.fingerprint, uaFamily: "python", clientName: "cursor" },
    });
    expect(r.reasons).toEqual(expect.arrayContaining(["tor_exit", "client_identity_mismatch"]));
    expect(r.risk).toBeGreaterThanOrEqual(60);
  });
});
