// Minimal moderation CLI.
//   pnpm review list [status...]       queue (default: pending_review, needs_consent)
//   pnpm review approve <id> [note]    publish
//   pnpm review reject <id> [note]
//   pnpm review sample <id>            show a published record in full on the website
//   pnpm review delete <id>            remove a record entirely (test data)
// Operator scripts use the direct (unpooled) connection when one exists. It also wins over a local
// DATABASE_URL that `vercel env run` layers on top of the remote environment from .env.local.
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { experiences, flags, reviewEvents, screenings } from "@/db/schema";
import type { Status } from "@/lib/aftertaste/evaluate";
import { listQueue, setStatus } from "@/lib/aftertaste/service";

async function main() {
  const [cmd = "list", id, ...rest] = process.argv.slice(2);
  const note = rest.join(" ") || "manual review";
  const db = getDb();

  switch (cmd) {
    case "list": {
      const statuses = (id ? [id, ...rest] : undefined) as Status[] | undefined;
      console.table(await listQueue(statuses));
      break;
    }
    case "approve":
      await setStatus(id, "published", note);
      break;
    case "reject":
      await setStatus(id, "rejected", note);
      break;
    case "sample":
      await db.update(experiences).set({ isPublicSample: true }).where(eq(experiences.id, id));
      break;
    case "delete":
      await db.delete(flags).where(eq(flags.experienceId, id));
      await db.delete(screenings).where(eq(screenings.experienceId, id));
      await db.delete(reviewEvents).where(eq(reviewEvents.experienceId, id));
      await db.delete(experiences).where(eq(experiences.id, id));
      break;
    default:
      throw new Error(`Unknown command ${cmd}`);
  }
  if (cmd !== "list") console.log(`${cmd} ${id}: done (public pages refresh within a few minutes)`);
  process.exit(0);
}

main();
