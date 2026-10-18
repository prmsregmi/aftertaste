// Integrity operator CLI.
//   pnpm integrity sweep               refresh IP lists, re-screen held records, detect anomalies, update trust and weights
//   pnpm integrity ranges              refresh the Tor, VPN, datacenter and AI-platform IP lists only
//   pnpm integrity anomalies [status]  list findings (default: detected)
//   pnpm integrity confirm <id> [note] confirm a finding: its records drop to weight 0
//   pnpm integrity dismiss <id> [note] dismiss a false positive: its records get full weight back
//   pnpm integrity screen <id>         show every screening verdict recorded for a record
//   pnpm integrity export [file]       write fused classifier verdicts as JSONL training labels for a distilled classifier
// Operator scripts use the direct (unpooled) connection when one exists.
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
import { writeFileSync } from "node:fs";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalies, screenings } from "@/db/schema";
import { refreshIpRanges } from "@/lib/aftertaste/integrity/network-db";
import { runSweep, updateTrust, updateWeights } from "@/lib/aftertaste/integrity/sweep";
import { rescreenPending } from "@/lib/aftertaste/service";

async function main() {
  const [cmd = "sweep", arg, ...rest] = process.argv.slice(2);
  const db = getDb();
  switch (cmd) {
    case "sweep": {
      console.log("rescreened", await rescreenPending());
      console.log(await runSweep());
      break;
    }
    case "ranges":
      console.log(await refreshIpRanges({ maxAgeHours: 0 }));
      break;
    case "anomalies": {
      const rows = await db
        .select({
          id: anomalies.id,
          kind: anomalies.kind,
          subject: anomalies.subjectId,
          polarity: anomalies.polarity,
          observed: anomalies.observed,
          score: anomalies.score,
          p: anomalies.pValue,
          submitters: sql<number>`cardinality(${anomalies.submitterKeys})`,
          end: anomalies.windowEnd,
        })
        .from(anomalies)
        .where(eq(anomalies.status, (arg ?? "detected") as "detected"))
        .orderBy(desc(anomalies.score));
      console.table(rows);
      break;
    }
    case "confirm":
    case "dismiss": {
      const status = cmd === "confirm" ? "confirmed" : "dismissed";
      await db
        .update(anomalies)
        .set({ status, details: sql`${anomalies.details} || ${JSON.stringify({ moderator_note: rest.join(" ") || null })}::jsonb`, updatedAt: new Date() })
        .where(eq(anomalies.id, arg));
      await updateTrust();
      console.log(`${status} ${arg}; weights changed for ${await updateWeights()} record(s)`);
      break;
    }
    case "screen":
      console.dir(await db.select().from(screenings).where(eq(screenings.experienceId, arg)), { depth: 6 });
      break;
    case "export": {
      const { rows } = await db.execute<{ id: string; status: string; result: unknown; record: unknown }>(sql`
        select e.id, e.status, s.result, json_build_object('summary', e.summary, 'observations', e.observations,
          'limitations', e.limitations, 'source_type', e.source_type) record
        from screenings s join experiences e on e.id = s.experience_id where s.layer = 'fused'`);
      const file = arg ?? "integrity-labels.jsonl";
      writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
      console.log(`wrote ${rows.length} labelled records to ${file}`);
      break;
    }
    default:
      throw new Error(`Unknown command ${cmd}`);
  }
  process.exit(0);
}

main();
