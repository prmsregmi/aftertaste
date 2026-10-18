import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ipIntel, ipRanges, requestSignals, searchUsage } from "@/db/schema";
import { sha256 } from "../ids";
import { ipv6BlockOf, type NetworkClass, networkRisk, prefixOf, type NetworkRisk, type RequestFingerprint } from "./network";

// Anthropic's published egress range for outbound MCP calls (platform.claude.com/docs/en/api/ip-addresses).
const ANTHROPIC_EGRESS = ["160.79.104.0/21"];

const RANGE_SOURCES: { source: string; category: NetworkClass; url: string; json?: boolean }[] = [
  { source: "tor_exit_list", category: "tor", url: "https://check.torproject.org/torbulkexitlist" },
  { source: "x4bnet_vpn", category: "vpn", url: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt" },
  {
    source: "x4bnet_datacenter",
    category: "datacenter",
    url: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt",
  },
  { source: "openai_connectors", category: "platform_openai", url: "https://openai.com/chatgpt-connectors.json", json: true },
];

// Platform matches win over the generic lists, which also contain cloud ranges.
const PRECEDENCE: NetworkClass[] = ["platform_anthropic", "platform_openai", "tor", "vpn", "datacenter"];

const CIDR = /(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?|[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?:\/\d{1,3})?/gi;

function parseRanges(body: string, json: boolean): string[] {
  // In JSON only explicit prefixes count, so timestamps like 12:30:00 are never read as IPv6.
  const candidates = json ? (body.match(CIDR) ?? []).filter((c) => c.includes("/")) : body.split(/\r?\n/).map((l) => l.trim());
  return candidates
    .filter((c) => c && !c.startsWith("#") && /[.:]/.test(c) && c.length >= 3)
    .map((c) => (c.includes("/") ? c : c.includes(":") ? `${c}/128` : `${c}/32`));
}

async function replaceRanges(source: string, category: string, ranges: string[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(ipRanges).where(eq(ipRanges.source, source));
    for (let i = 0; i < ranges.length; i += 2000) {
      // Lists occasionally carry a malformed line; skip rows that don't look like CIDRs instead of failing the batch.
      await tx.execute(sql`
        insert into ip_ranges (range, category, source)
        select network(r::inet), ${category}, ${source}
        from jsonb_array_elements_text(${JSON.stringify(ranges.slice(i, i + 2000))}::jsonb) as r
        where r ~ '^[0-9a-fA-F.:]+/[0-9]{1,3}$'`);
    }
  });
}

// Downloads the public lists. Each source is independent, so one outage leaves the others current.
export async function refreshIpRanges(opts: { maxAgeHours?: number } = {}) {
  const db = getDb();
  const maxAge = opts.maxAgeHours ?? 24;
  const results: Record<string, number | string> = {};
  const [anthropic] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ipRanges)
    .where(eq(ipRanges.source, "anthropic_egress"));
  if (!anthropic.n) {
    await replaceRanges("anthropic_egress", "platform_anthropic", ANTHROPIC_EGRESS);
    results.anthropic_egress = ANTHROPIC_EGRESS.length;
  }
  for (const s of RANGE_SOURCES) {
    const [fresh] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(ipRanges)
      .where(and(eq(ipRanges.source, s.source), sql`${ipRanges.refreshedAt} > now() - make_interval(hours => ${maxAge})`));
    if (fresh.n) continue;
    try {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ranges = parseRanges(await res.text(), Boolean(s.json));
      if (!ranges.length) throw new Error("empty list");
      await replaceRanges(s.source, s.category, ranges);
      results[s.source] = ranges.length;
    } catch (err) {
      results[s.source] = `failed: ${(err as Error).message}`;
    }
  }
  return results;
}

export async function classifyIp(ip: string | null): Promise<NetworkClass> {
  if (!ip) return "unknown";
  const { rows } = await getDb().execute<{ category: NetworkClass }>(sql`
    select distinct category from ip_ranges where range >>= ${ip}::inet`);
  const found = new Set(rows.map((r) => r.category));
  return PRECEDENCE.find((c) => found.has(c)) ?? "unknown";
}

const salted = (value: string) => {
  const salt = process.env.AFTERTASTE_HASH_SALT;
  if (!salt) throw new Error("AFTERTASTE_HASH_SALT is not set");
  return sha256(`${salt}:${value}`).slice(0, 32);
};

export const prefixHashOf = (ip: string | null) => salted(`prefix:${ip ? prefixOf(ip) : "unknown"}`);

// Search-allowance key for an anonymous caller: the /64 block for IPv6, otherwise null (use the IP hash).
export const ipv6BlockHashOf = (ip: string | null) => {
  const block = ip && ipv6BlockOf(ip);
  return block ? salted(`block:${block}`) : null;
};

type Asn = { asn: number | null; asName: string | null; country: string | null };

// IPinfo Lite (free, token required) gives ASN and country. Cached per prefix for a day; skipped
// without IPINFO_TOKEN, and a slow lookup never holds up the write.
async function asnOf(ip: string | null, prefixHash: string): Promise<Asn> {
  const none = { asn: null, asName: null, country: null };
  if (!ip) return none;
  const db = getDb();
  const [cached] = await db
    .select()
    .from(ipIntel)
    .where(and(eq(ipIntel.prefixHash, prefixHash), sql`${ipIntel.fetchedAt} > now() - interval '1 day'`));
  if (cached) return { asn: cached.asn, asName: cached.asName, country: cached.country };
  const token = process.env.IPINFO_TOKEN;
  if (!token) return none;
  try {
    const res = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${token}`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return none;
    const body = (await res.json()) as { asn?: string; as_name?: string; as_domain?: string; country_code?: string };
    const asn = body.asn ? Number(body.asn.replace(/^AS/i, "")) || null : null;
    const row = { asn, asName: body.as_name ?? null, asDomain: body.as_domain ?? null, country: body.country_code ?? null };
    await db
      .insert(ipIntel)
      .values({ prefixHash, ...row })
      .onConflictDoUpdate({ target: ipIntel.prefixHash, set: { ...row, fetchedAt: new Date() } });
    return row;
  } catch {
    return none;
  }
}

export type NetworkAssessment = NetworkRisk & {
  networkClass: NetworkClass;
  prefixHash: string;
  asn: Asn;
};

type AssessInput = {
  action: "submit" | "register" | "flag";
  submitterKey: string;
  contributorId: string | null;
  contributorCreatedAt: Date | null;
  ipHash: string;
  fingerprint: RequestFingerprint;
};

export async function assessNetwork(input: AssessInput): Promise<NetworkAssessment> {
  const db = getDb();
  const { fingerprint: fp } = input;
  const prefixHash = prefixHashOf(fp.ip);
  const [networkClass, asn, counts] = await Promise.all([
    classifyIp(fp.ip),
    asnOf(fp.ip, prefixHash),
    db.execute<{
      prefix_writes: number;
      prefix_submitters: number;
      prefix_registrations: number;
      fingerprint_registrations: number;
      accepted: number;
    }>(sql`
      select
        (select count(*)::int from request_signals
          where prefix_hash = ${prefixHash} and action = 'submit' and created_at > now() - interval '1 hour') as prefix_writes,
        (select count(distinct submitter_key)::int from request_signals
          where prefix_hash = ${prefixHash} and created_at > now() - interval '1 day') as prefix_submitters,
        (select count(*)::int from request_signals
          where prefix_hash = ${prefixHash} and action = 'register' and created_at > now() - interval '1 day') as prefix_registrations,
        (select count(*)::int from request_signals
          where action = 'register' and created_at > now() - interval '1 day'
            and header_hash = ${sha256(fp.headerHash).slice(0, 16)} and ua_family is not distinct from ${fp.uaFamily}
            and ja4 is not distinct from ${fp.ja4}) as fingerprint_registrations,
        (select count(*)::int from experiences
          where submitter_key = ${input.submitterKey} and status = 'published' and flag_count = 0) as accepted`),
  ]);
  const c = counts.rows[0];
  const risk = networkRisk({
    action: input.action,
    networkClass,
    fingerprint: fp,
    registered: Boolean(input.contributorId),
    tokenAgeHours: input.contributorCreatedAt ? (Date.now() - input.contributorCreatedAt.getTime()) / 3600_000 : null,
    prefixWritesLastHour: c.prefix_writes,
    prefixDistinctSubmittersLastDay: c.prefix_submitters,
    prefixRegistrationsLastDay: c.prefix_registrations,
    fingerprintRegistrationsLastDay: c.fingerprint_registrations,
    acceptedHistory: c.accepted,
  });
  return { ...risk, networkClass, prefixHash, asn };
}

export async function recordRequestSignal(
  input: AssessInput & { experienceId?: string | null },
  assessment: NetworkAssessment,
) {
  const { fingerprint: fp } = input;
  await getDb()
    .insert(requestSignals)
    .values({
      action: input.action,
      submitterKey: input.submitterKey,
      contributorId: input.contributorId,
      experienceId: input.experienceId ?? null,
      ipHash: input.ipHash,
      prefixHash: assessment.prefixHash,
      country: fp.country ?? assessment.asn.country,
      asn: assessment.asn.asn,
      asName: assessment.asn.asName,
      networkClass: assessment.networkClass,
      ja4: fp.ja4,
      headerHash: sha256(fp.headerHash).slice(0, 16),
      uaFamily: fp.uaFamily,
      clientName: fp.clientName,
      clientVersion: fp.clientVersion,
      risk: assessment.risk,
      riskReasons: assessment.reasons,
    });
}

// Signals are kept for 90 days, long enough for campaign analysis and no longer. Search counts only
// matter for the current UTC day.
export async function pruneRequestSignals() {
  const db = getDb();
  await db.delete(requestSignals).where(lt(requestSignals.createdAt, sql`now() - interval '90 days'`));
  await db.delete(searchUsage).where(lt(searchUsage.day, sql`(now() at time zone 'utc')::date - 1`));
}
