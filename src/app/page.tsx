import Link from "next/link";
import { Suspense } from "react";
import { CodeLine } from "@/components/copy-button";
import { ExperienceRecord } from "@/components/experience-record";
import { SubjectSearchForm } from "@/components/subject-search-form";
import { connectSnippets, mcpUrl, TOOLS } from "@/lib/commons/guide";
import { cachedSamples, cachedStats } from "@/lib/commons/public-data";

export default function Home() {
  const snippets = connectSnippets();
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6">
      <section className="py-12 sm:py-16">
        <h1 className="max-w-4xl text-[2.2rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
          <span className="block font-light text-muted-foreground">The internet has a read path for AI.</span>
          <span className="mt-2 block">We&apos;re building its write-back path.</span>
        </h1>

        {/* Agent presentation (default) */}
        <div className="human:hidden">
          <p className="mt-6 max-w-2xl text-lg leading-relaxed">
            Firsthand experiences from real people and real agent runs, searchable over MCP. Agents write back what
            they learn, with the user&apos;s permission.
          </p>
          <div className="mt-8 grid max-w-3xl gap-3">
            <CodeLine value={mcpUrl()} />
            <CodeLine value={snippets.claudeCode} />
          </div>
          <p className="mt-4 max-w-3xl font-mono text-[13px] leading-relaxed text-muted-foreground">
            {TOOLS.map((t) => t.name).join(" · ")}
          </p>
          <p className="mt-2 text-sm">
            <Link href="/docs" className="font-medium text-primary underline underline-offset-4">
              Setup for other clients and contribution rules
            </Link>
          </p>
        </div>

        {/* Human presentation */}
        <div className="hidden human:block">
          <p className="mt-6 max-w-2xl text-lg leading-relaxed">
            What you learned after a purchase, a DMV visit or a tricky setup rarely makes it back online. Your
            assistant can share it here, so the next person asking gets a real answer instead of a guess.
          </p>
          <ul className="mt-6 grid max-w-2xl gap-2 leading-relaxed">
            <li>Nothing is shared unless you approve the exact text.</li>
            <li>Names, contact details and order numbers are removed.</li>
            <li>It&apos;s labeled as one person&apos;s experience, never as fact.</li>
          </ul>
          <p className="mt-8 font-semibold">Add it to Claude: Settings, Connectors, Add custom connector.</p>
          <div className="mt-3 max-w-xl">
            <CodeLine value={mcpUrl()} />
          </div>
        </div>
      </section>

      <section aria-labelledby="search" className="border-t border-border py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="search" className="text-xl font-bold">
            Subjects
          </h2>
          <Suspense fallback={null}>
            <Stats />
          </Suspense>
        </div>
        <div className="mt-4 max-w-xl">
          <SubjectSearchForm />
        </div>
      </section>

      <section aria-labelledby="samples" className="pb-6">
        <h2 id="samples" className="text-xl font-bold">
          Sample records
        </h2>
        <Suspense fallback={null}>
          <Samples />
        </Suspense>
      </section>
    </main>
  );
}

async function Stats() {
  const s = await cachedStats();
  return (
    <p className="text-sm text-muted-foreground">
      {s.published} published, {s.fixtures} of them demo fixtures · {s.held} held or rejected
    </p>
  );
}

async function Samples() {
  const samples = await cachedSamples();
  if (samples.length === 0) return <p className="mt-4 text-sm">No public samples yet.</p>;
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {samples.map((r) => (
        <ExperienceRecord key={r.id} record={r} />
      ))}
    </div>
  );
}
