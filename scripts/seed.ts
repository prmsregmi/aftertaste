// Seeds clearly labeled demo fixtures. Idempotent: skips records whose content hash already exists.
import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { experiences } from "@/db/schema";
import { submissionSchema } from "@/lib/aftertaste/contracts";
import { contentHashOf, insertExperience } from "@/lib/aftertaste/service";

const FIXTURE_LIMITATION =
  "Demo fixture written to show the record format; it is not a real observation and must not be relied on.";

const hardcodedFixtures = [
  {
    subject: {
      name: "El Cerrito DMV motorcycle skills test",
      kind: "process",
      location: "El Cerrito, CA",
      aliases: ["El Cerrito DMV M1 skills test"],
    },
    source_type: "human_firsthand",
    summary:
      "Illustrative: a rider reports the skills-test course was run in the opposite direction from a description they had read online.",
    observations: [
      {
        aspect: "course direction",
        observation:
          "Illustrative: the rider says the examiner had them ride the course in the opposite direction from an online guide they had read.",
        polarity: "neutral",
      },
      {
        aspect: "briefing",
        observation: "Illustrative: the examiner described the course layout before the test started.",
        polarity: "positive",
      },
    ],
    context: { test: "motorcycle skills test" },
    observed_on: "2026-09",
    limitations: `${FIXTURE_LIMITATION} Real DMV procedures vary by office, examiner and date.`,
    permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
  },
  {
    subject: {
      name: "Canyon Grail CF SL bicycle",
      kind: "physical_product",
      brand: "Canyon",
      aliases: ["Canyon Grail"],
    },
    source_type: "human_firsthand",
    summary:
      "Illustrative: a rider who usually fits size M found the M frame's reach slightly long on rides over two hours.",
    variant: "size M",
    observations: [
      {
        aspect: "fit",
        observation: "Illustrative: reach on the size M frame felt slightly long after about two hours of riding.",
        polarity: "mixed",
      },
    ],
    context: { usual_size: "M", ride_length: "2+ hours" },
    observed_on: "2026-08",
    limitations: `${FIXTURE_LIMITATION} Fit depends on body proportions and stem length.`,
    permission: { basis: "explicit_user_approval", user_reviewed_final_text: true },
  },
];

const jsonlPath = join(import.meta.dirname, "../data/experiences.jsonl");
const jsonlFixtures = readFileSync(jsonlPath, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const fixtures = [...hardcodedFixtures, ...jsonlFixtures];

async function main() {
  for (const raw of fixtures) {
    const s = submissionSchema.parse(raw);
    const hash = contentHashOf(s);
    const [exists] = await getDb().select({ id: experiences.id }).from(experiences).where(eq(experiences.contentHash, hash));
    if (exists) {
      console.log(`skip ${exists.id} ${s.subject.name}`);
      continue;
    }
    const { id } = await insertExperience(s, hash, {
      status: "published",
      reasonCodes: ["demo_fixture"],
      reasonText: "Seeded demo fixture.",
      actor: null,
      requestId: "seed",
      isDemoFixture: true,
      isPublicSample: true,
    });
    console.log(`seeded ${id} ${s.subject.name}`);
  }
  process.exit(0);
}

main();
