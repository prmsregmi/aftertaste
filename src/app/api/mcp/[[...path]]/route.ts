import { createNextHandler } from "mcp-use/next";
import { siteUrl } from "@/lib/aftertaste/guide";
import { CORS, resourceMetadataUrl } from "@/lib/aftertaste/oauth";
import { authenticate, consumeRequestBudget } from "@/lib/aftertaste/service";
import server from "@/mcp/server";

export const maxDuration = 60;

const mcp = createNextHandler(server);
export const { GET, DELETE, OPTIONS } = mcp;

// The 401 points chat apps to the sign-in metadata; terminal agents read the message instead.
const reject = (status: number, error: string, message: string) =>
  Response.json(
    { error, message },
    {
      status,
      headers: {
        ...CORS,
        ...(status === 401 && { "WWW-Authenticate": `Bearer realm="aftertaste", resource_metadata="${resourceMetadataUrl()}"` }),
      },
    },
  );

// Every POST needs a contributor token: MCP calls arrive only as POSTs, and view assets are GETs. One
// token can't take more than its hourly share, and the whole service shares one hourly ceiling.
export async function POST(request: Request) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const contributor = token ? await authenticate(token) : null;
  if (!contributor) {
    return reject(401, "unauthorized", `A contributor token is required. Run the setup command for your client: ${siteUrl()}/install.md`);
  }
  const budget = await consumeRequestBudget(contributor.id);
  if (budget !== "ok") {
    return reject(
      429,
      budget,
      budget === "token_limit"
        ? "This token is at its hourly request limit. Retry after the top of the hour."
        : "Aftertaste is at its hourly request limit. Retry after the top of the hour.",
    );
  }
  return mcp.POST(request);
}
