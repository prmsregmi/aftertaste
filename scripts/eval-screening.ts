// Runs labeled cases through the rules and the live screening models, combined the way submissions are,
// and reports where the outcome differs from the label. Needs the model keys; never touches the database.
//   pnpm exec dotenv -e .env.local -- tsx scripts/eval-screening.ts <cases.jsonl>... [--out results.json]
// Each line: {"id", "category", "expected": "publish"|"hold"|"reject", "expected_flags": [...], "submission": {...}}
import { readFileSync, writeFileSync } from "node:fs";
import { submissionSchema } from "@/lib/aftertaste/contracts";
import { evaluateSubmission } from "@/lib/aftertaste/evaluate";
import { defaultProviders, screenContent } from "@/lib/aftertaste/integrity/classifiers";

type Outcome = "publish" | "hold" | "reject";
type Case = { id: string; category: string; expected: Outcome; expected_flags?: string[]; submission: unknown };

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args[outIndex + 1] : null;
const files = args.filter((_, i) => outIndex < 0 || (i !== outIndex && i !== outIndex + 1));

// Embeddings only serve paraphrase search, which needs stored records, so they are skipped here.
const providers = { ...defaultProviders(), embed: undefined };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cases = files.flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Case),
  );
  const results = [];
  for (const c of cases) {
    const parsed = submissionSchema.safeParse(c.submission);
    if (!parsed.success) {
      results.push({ id: c.id, category: c.category, expected: c.expected, got: "invalid", error: parsed.error.issues[0]?.message });
      continue;
    }
    const rules = evaluateSubmission(parsed.data);
    // As in production, a record the rules reject never reaches the models.
    if (rules.status === "rejected") {
      results.push({ id: c.id, category: c.category, expected: c.expected, got: "reject", expected_flags: c.expected_flags ?? [], flags: [], rules: rules.reasonCodes });
      console.log(`${c.expected === "reject" ? "ok  " : "MISS"} ${c.id.padEnd(12)} want ${c.expected.padEnd(7)} got reject  (rules) ${rules.reasonCodes.join(",")}`);
      continue;
    }
    const content = await screenContent(rules.redacted, providers);
    const decision = content.decision?.outcome;
    const got: Outcome =
      decision === "reject"
        ? "reject"
        : rules.status !== "published" || decision === "hold" || !content.complete
          ? "hold"
          : "publish";
    const flags = Object.entries(content.probabilities ?? {})
      .filter(([, p]) => p >= 0.3)
      .map(([q, p]) => `${q}=${p.toFixed(2)}`);
    const decisionLayer = content.layers.find((l) => l.layer === "decision")?.result as { model?: string } | undefined;
    const errors = content.layers.filter((l) => (l.result as { error?: string })?.error).map((l) => l.layer);
    results.push({
      id: c.id,
      category: c.category,
      expected: c.expected,
      got,
      expected_flags: c.expected_flags ?? [],
      flags,
      rules: rules.reasonCodes,
      model: decisionLayer?.model,
      ...(errors.length && { layer_errors: errors }),
    });
    const r = results.at(-1)!;
    console.log(`${r.got === c.expected ? "ok  " : "MISS"} ${c.id.padEnd(12)} want ${c.expected.padEnd(7)} got ${r.got.padEnd(7)} ${flags.join(" ")} ${rules.reasonCodes.join(",")}`);
    // Stay under free-tier per-minute limits on the injection classifier.
    await sleep(1200);
  }

  const outcomes: Outcome[] = ["publish", "hold", "reject"];
  console.log("\nexpected \\ got   publish  hold  reject  invalid");
  for (const e of outcomes) {
    const row = results.filter((r) => r.expected === e);
    console.log(`${e.padEnd(16)} ${["publish", "hold", "reject", "invalid"].map((g) => String(row.filter((r) => r.got === g).length).padStart(6)).join("  ")}`);
  }
  const scored = results.filter((r) => r.got !== "invalid");
  const correct = scored.filter((r) => r.got === r.expected).length;
  console.log(`\naccuracy ${correct}/${scored.length}; false rejects of publishable records: ${scored.filter((r) => r.expected === "publish" && r.got === "reject").length}; harmful records published: ${scored.filter((r) => r.expected !== "publish" && r.got === "publish").length}`);
  if (out) writeFileSync(out, JSON.stringify(results, null, 2));
  process.exit(0);
}

main();
