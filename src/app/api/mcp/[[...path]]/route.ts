import { createNextHandler } from "mcp-use/next";
import { siteUrl } from "@/lib/aftertaste/guide";
import { authenticate, consumeGlobalRequest } from "@/lib/aftertaste/service";
import server from "@/mcp/server";

export const maxDuration = 60;

const mcp = createNextHandler(server);
export const { GET, DELETE, OPTIONS } = mcp;

const reject = (status: number, error: string, message: string) =>
  Response.json({ error, message }, { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="aftertaste"' } : {} });

// Every MCP call needs a contributor token, and the whole service shares one hourly ceiling. Only the
// protocol endpoint is gated; view assets under it are fetched without credentials.
export async function POST(request: Request) {
  if (new URL(request.url).pathname.replace(/\/$/, "") === "/api/mcp") {
    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token || !(await authenticate(token))) {
      return reject(401, "unauthorized", `A contributor token is required. Run the setup command for your client: ${siteUrl()}/install.md`);
    }
    if (!(await consumeGlobalRequest())) {
      return reject(429, "busy", "Aftertaste is at its hourly request limit. Retry after the top of the hour.");
    }
  }
  return mcp.POST(request);
}
