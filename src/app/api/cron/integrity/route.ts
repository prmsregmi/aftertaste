import { timingSafeEqual } from "node:crypto";
import { runSweep } from "@/lib/aftertaste/integrity/sweep";
import { revalidateTag } from "next/cache";
import { CACHE_TAG, rescreenPending } from "@/lib/aftertaste/service";

export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; without the secret configured, nothing runs.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const rescreened = await rescreenPending();
  const report = await runSweep();
  // Weights and activity notices changed, so public pages refresh.
  revalidateTag(CACHE_TAG, "max");
  console.log(JSON.stringify({ event: "integrity_sweep", rescreened, report }));
  return Response.json({ rescreened, report });
}
