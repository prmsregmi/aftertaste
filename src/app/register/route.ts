import { acceptableRedirect, clientIdFor, CORS, preflight } from "@/lib/aftertaste/oauth";

// Dynamic client registration for chat apps. Nothing is stored: the client ID is the signed list of
// redirect URIs, so it stays valid for as long as the app keeps it.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(acceptableRedirect)) {
    return Response.json({ error: "invalid_redirect_uri" }, { status: 400, headers: CORS });
  }
  const name = typeof body?.client_name === "string" ? body.client_name.slice(0, 80) : undefined;
  return Response.json(
    {
      client_id: clientIdFor({ redirect_uris: uris, name }),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(name && { client_name: name }),
    },
    { status: 201, headers: CORS },
  );
}

export const OPTIONS = preflight;
