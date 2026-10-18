import { authorizationServerMetadata, CORS, preflight } from "@/lib/aftertaste/oauth";

export const GET = () => Response.json(authorizationServerMetadata(), { headers: CORS });
export const OPTIONS = preflight;
