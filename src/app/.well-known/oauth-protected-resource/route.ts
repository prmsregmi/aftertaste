import { CORS, preflight, protectedResourceMetadata } from "@/lib/aftertaste/oauth";

// RFC 9728 metadata for the MCP endpoint, at the root path; the path-suffixed copy is what the 401 points to.
export const GET = () => Response.json(protectedResourceMetadata(), { headers: CORS });
export const OPTIONS = preflight;
