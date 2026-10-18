import { ipAddress } from "@vercel/functions";
import { checkBotId } from "botid/server";
import { fingerprintOf } from "@/lib/aftertaste/integrity/network";
import { clientFrom, issueCode, issuer, sameResource } from "@/lib/aftertaste/oauth";
import { AftertasteError, checkRegistration, hashIp } from "@/lib/aftertaste/service";

type Params = {
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
};

const fail = (status: number, message: string) => Response.json({ error: message }, { status });

// The Continue button. This request comes from the user's own browser, so the bot check and the
// per-network registration limit run here; the resulting code carries the network hash to /token.
export async function POST(request: Request) {
  const p = (await request.json().catch(() => ({}))) as Params;
  const client = clientFrom(p.client_id ?? null);
  if (!client || !p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    return fail(400, "This sign-in link is not valid. Start again from your app.");
  }
  if (p.code_challenge_method !== "S256" || !p.code_challenge || !sameResource(p.resource)) {
    return fail(400, "This sign-in request is missing required parameters. Start again from your app.");
  }
  // BotID only runs on Vercel; it throws elsewhere.
  if (process.env.VERCEL === "1" && (await checkBotId()).isBot) return fail(403, "Automated sign-ins are not allowed.");
  const ip = ipAddress(request) ?? null;
  const ipHash = hashIp(ip || "unknown");
  try {
    await checkRegistration({
      contributorId: null,
      contributorLabel: null,
      inkboxHandle: null,
      ipHash,
      ipKnown: Boolean(ip),
      fingerprint: fingerprintOf(request.headers, ip),
    });
  } catch (err) {
    if (err instanceof AftertasteError) return fail(429, err.message);
    throw err;
  }
  const redirect = new URL(p.redirect_uri);
  redirect.searchParams.set("code", issueCode({ client_id: p.client_id!, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, ip_hash: ipHash }));
  if (p.state) redirect.searchParams.set("state", p.state);
  redirect.searchParams.set("iss", issuer());
  return Response.json({ redirect: redirect.toString() });
}
