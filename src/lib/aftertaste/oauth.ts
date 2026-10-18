// Minimal OAuth for chat apps (Claude.ai, ChatGPT) with no accounts: a one-click Continue page mints a
// contributor, and the app receives the same static token terminal agents get. Clients and codes are
// signed payloads, so nothing but the contributor row is stored.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mcpUrl, siteUrl } from "./guide";

// The issuer and resource must match, character for character, what apps see: no trailing slash.
export const issuer = () => siteUrl().replace(/\/$/, "");
export const resourceUrl = () => mcpUrl().replace(/\/$/, "");
export const resourceMetadataUrl = () => `${issuer()}/.well-known/oauth-protected-resource/api/mcp`;

// Discovery and token calls come from app backends, but browser-based inspectors need CORS.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "access-control-expose-headers": "WWW-Authenticate",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export const protectedResourceMetadata = () => ({
  resource: resourceUrl(),
  authorization_servers: [issuer()],
  bearer_methods_supported: ["header"],
});

// No refresh tokens: access tokens are the same static contributor tokens terminal agents use, so the
// advertised lifetime is ten years and apps never need to refresh.
export const TOKEN_LIFETIME_SECONDS = 315_360_000;

export const authorizationServerMetadata = () => ({
  issuer: issuer(),
  authorization_endpoint: `${issuer()}/authorize`,
  token_endpoint: `${issuer()}/token`,
  registration_endpoint: `${issuer()}/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  authorization_response_iss_parameter_supported: true,
});

// Callbacks a client may register: any https URL, a loopback http URL, or a native app scheme.
export function acceptableRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (["javascript:", "data:", "file:", "vbscript:", "blob:"].includes(u.protocol)) return false;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return true;
  } catch {
    return false;
  }
}

export const sameResource = (value: string | null | undefined) =>
  !value || value.replace(/\/$/, "").toLowerCase() === resourceUrl().toLowerCase();

const key = () => {
  const salt = process.env.AFTERTASTE_HASH_SALT;
  if (!salt) throw new Error("AFTERTASTE_HASH_SALT is not set");
  return `oauth:${salt}`;
};

export function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function verify<T extends { exp?: number }>(signed: string | null | undefined): T | null {
  const [body, mac] = (signed ?? "").split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  return payload.exp !== undefined && payload.exp < Date.now() ? null : payload;
}

// Dynamic client registration without a table: the client ID is the signed list of redirect URIs.
export type Client = { redirect_uris: string[]; name?: string; exp?: number };
export const clientIdFor = (client: Client) => sign(client);
export const clientFrom = (clientId: string | null) => verify<Client>(clientId);

// What the Continue page hands to the token endpoint. The browser's network hash travels inside, because
// the code exchange itself comes from the app's servers, not the user's network.
export type Code = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  ip_hash: string;
  nonce: string;
  exp: number;
};

export const issueCode = (c: Omit<Code, "nonce" | "exp">) =>
  sign({ ...c, nonce: randomBytes(12).toString("base64url"), exp: Date.now() + 5 * 60_000 } satisfies Code);

export const pkceMatches = (verifier: string, challenge: string) =>
  createHash("sha256").update(verifier).digest("base64url") === challenge;
