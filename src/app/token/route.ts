import { randomBytes } from "node:crypto";
import { type Code, CORS, pkceMatches, preflight, sameResource, TOKEN_LIFETIME_SECONDS, verify } from "@/lib/aftertaste/oauth";
import { claimOnce, createContributor } from "@/lib/aftertaste/service";

const oauthError = (error: string) =>
  Response.json({ error }, { status: 400, headers: { ...CORS, "cache-control": "no-store" } });

// Exchanges a Continue-page code for a contributor token. The contributor is created here, after PKCE,
// so abandoned sign-ins create nothing; the network limits already ran when the user clicked Continue.
export async function POST(request: Request) {
  const raw = await request.text();
  const params = (request.headers.get("content-type") ?? "").includes("json")
    ? new URLSearchParams(Object.entries(JSON.parse(raw || "{}")).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(raw);
  if (params.get("grant_type") !== "authorization_code") return oauthError("unsupported_grant_type");
  const code = verify<Code>(params.get("code"));
  if (
    !code ||
    (params.get("client_id") ?? code.client_id) !== code.client_id ||
    (params.get("redirect_uri") ?? code.redirect_uri) !== code.redirect_uri ||
    !pkceMatches(params.get("code_verifier") ?? "", code.code_challenge)
  ) {
    return oauthError("invalid_grant");
  }
  if (!sameResource(params.get("resource"))) return oauthError("invalid_target");
  if (!(await claimOnce(`oauth_code:${code.nonce}`, code.exp))) return oauthError("invalid_grant");
  const { token } = await createContributor(`chat-${randomBytes(3).toString("hex")}`, "agent", code.ip_hash);
  const scope = params.get("scope");
  return Response.json(
    { access_token: token, token_type: "Bearer", expires_in: TOKEN_LIFETIME_SECONDS, ...(scope && { scope }) },
    { headers: { ...CORS, "cache-control": "no-store", pragma: "no-cache" } },
  );
}

export const OPTIONS = preflight;
