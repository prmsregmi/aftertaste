import { randomBytes } from "node:crypto";
import { ipAddress } from "@vercel/functions";
import { fingerprintOf } from "@/lib/aftertaste/integrity/network";
import { AftertasteError, hashIp, registerContributor } from "@/lib/aftertaste/service";

const LABEL = /^[a-z0-9][a-z0-9-]{1,59}$/i;

// Issues a contributor token for the setup command and prints it as plain text, so a shell can capture
// it and pass it to the MCP client in one step. Network registration limits apply.
export async function POST(request: Request) {
  const ip = ipAddress(request) ?? null;
  const requested = new URL(request.url).searchParams.get("label");
  const label = requested && LABEL.test(requested) ? requested : `agent-${randomBytes(3).toString("hex")}`;
  try {
    const { token } = await registerContributor(label, "agent", {
      contributorId: null,
      contributorLabel: null,
      inkboxHandle: null,
      ipHash: hashIp(ip || "unknown"),
      ipKnown: Boolean(ip),
      fingerprint: fingerprintOf(request.headers, ip),
    });
    return new Response(`${token}\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof AftertasteError) return new Response(`${err.message}\n`, { status: 429 });
    throw err;
  }
}
