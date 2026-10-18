// Network and client signals for write requests. Agents are the expected callers, so automation itself
// is never penalized; the signals look for anonymizing infrastructure, spoofed clients and many
// identities coming from one place.

export type NetworkClass =
  | "platform_anthropic"
  | "platform_openai"
  | "tor"
  | "vpn"
  | "datacenter"
  | "unknown";

export type UaFamily =
  | "claude_connector"
  | "chatgpt_connector"
  | "claude_code"
  | "codex"
  | "cursor"
  | "vscode"
  | "gemini"
  | "mcp_sdk"
  | "node"
  | "python"
  | "curl"
  | "go"
  | "browser"
  | "other"
  | "none";

export type RequestFingerprint = {
  ip: string | null;
  country: string | null;
  ja4: string | null;
  headerHash: string;
  uaFamily: UaFamily;
  clientName: string | null;
  clientVersion: string | null;
};

const UA_PATTERNS: [UaFamily, RegExp][] = [
  ["claude_connector", /Claude-User|claude\.ai/i],
  ["chatgpt_connector", /ChatGPT-User|openai-mcp|OAI-SearchBot/i],
  ["claude_code", /claude-code|claude-cli/i],
  ["codex", /codex/i],
  ["cursor", /cursor/i],
  ["vscode", /vscode|visual studio code/i],
  ["gemini", /gemini/i],
  ["mcp_sdk", /mcp|modelcontextprotocol/i],
  ["python", /python|httpx|aiohttp|requests\//i],
  ["curl", /^curl\//i],
  ["go", /Go-http-client/i],
  ["node", /node|undici|axios/i],
  ["browser", /Mozilla\/5\.0/i],
];

export function uaFamilyOf(ua: string | null | undefined): UaFamily {
  if (!ua) return "none";
  return UA_PATTERNS.find(([, re]) => re.test(ua))?.[0] ?? "other";
}

// Headers added by Vercel or proxies say nothing about the client, so they are left out of the fingerprint.
const PLATFORM_HEADER = /^(x-vercel-|x-forwarded-|x-real-ip|forwarded|via|cf-|x-amzn-|traceparent|tracestate|content-length)/;

// Fetch sorts header names, so arrival order is lost; the set of names a client sends is still distinctive.
export function headerSetOf(headers: Headers): string {
  return [...headers.keys()].filter((name) => !PLATFORM_HEADER.test(name)).join(",");
}

// /24 for IPv4 and /48 for IPv6: one household, office or small hosting block.
export function prefixOf(ip: string): string {
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts.slice(0, 3).join(".")}.0/24` : ip;
  }
  const v4 = /::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return prefixOf(v4[1]);
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  return `${groups
    .slice(0, 3)
    .map((g) => (parseInt(g || "0", 16) || 0).toString(16))
    .join(":")}::/48`;
}

export type NetworkContext = {
  action: "submit" | "register" | "flag";
  networkClass: NetworkClass;
  fingerprint: RequestFingerprint;
  registered: boolean;
  tokenAgeHours: number | null;
  // Recent activity from the same /24 or /48 and the same client fingerprint, excluding this request.
  prefixWritesLastHour: number;
  prefixDistinctSubmittersLastDay: number;
  prefixRegistrationsLastDay: number;
  fingerprintRegistrationsLastDay: number;
  // Records by this submitter that held up (published and unflagged).
  acceptedHistory: number;
};

export type NetworkRisk = { risk: number; reasons: string[] };

const isPlatform = (c: NetworkClass) => c === "platform_anthropic" || c === "platform_openai";

// Additive score in [0, 100]. Platform egress ranges are shared by every user of that platform, so
// per-network velocity is not counted against them.
export function networkRisk(ctx: NetworkContext): NetworkRisk {
  const reasons: string[] = [];
  let risk = 0;
  const add = (points: number, reason: string) => {
    risk += points;
    reasons.push(reason);
  };
  const { fingerprint: fp, networkClass } = ctx;

  if (networkClass === "tor") add(40, "tor_exit");
  else if (networkClass === "vpn") add(15, "vpn_range");
  else if (networkClass === "datacenter") add(ctx.registered ? 5 : 15, "datacenter_range");

  // A hosted connector's user agent must come from that vendor's published egress ranges.
  if (fp.uaFamily === "claude_connector" && networkClass !== "platform_anthropic") add(25, "spoofed_claude_connector");
  if (fp.uaFamily === "chatgpt_connector" && networkClass !== "platform_openai") add(25, "spoofed_chatgpt_connector");
  // A client that names itself in MCP metadata but sends a scripting library's user agent.
  const named = fp.clientName?.toLowerCase() ?? "";
  if (/claude|cursor|codex|vscode|gemini/.test(named) && ["python", "curl", "go"].includes(fp.uaFamily)) {
    add(20, "client_identity_mismatch");
  }
  if (fp.uaFamily === "none" && !fp.clientName) add(10, "no_client_identity");

  if (ctx.registered && ctx.tokenAgeHours !== null) {
    if (ctx.tokenAgeHours < 1) add(10, "token_under_1h");
    else if (ctx.tokenAgeHours < 24) add(5, "token_under_24h");
  }

  if (!isPlatform(networkClass)) {
    if (ctx.prefixWritesLastHour >= 10) add(20, "network_write_burst");
    if (ctx.prefixDistinctSubmittersLastDay >= 5) add(20, "many_identities_one_network");
    if (ctx.action === "register" && ctx.prefixRegistrationsLastDay >= 3) add(35, "token_farming_network");
  }
  if (ctx.action === "register" && ctx.fingerprintRegistrationsLastDay >= 5) add(15, "token_farming_fingerprint");

  if (ctx.acceptedHistory >= 5) add(-15, "established_contributor");

  return { risk: Math.max(0, Math.min(100, risk)), reasons };
}

export const NETWORK_HOLD = 60;
export const NETWORK_BLOCK_REGISTRATION = 70;
