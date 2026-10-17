import Link from "next/link";
import { Suspense } from "react";
import { CodeLine, PromptNote } from "@/components/copy-button";
import { ExperienceRecord } from "@/components/experience-record";
import { SubjectSearchForm } from "@/components/subject-search-form";
import { connectSnippets, mcpUrl, TOOLS } from "@/lib/commons/guide";
import { cachedSamples, cachedStats } from "@/lib/commons/public-data";
import { cn } from "@/lib/utils";

const PROMISES = [
  { text: "Your OK first", dot: "bg-highlight" },
  { text: "No names or contacts", dot: "bg-human" },
  { text: "Never shown as fact", dot: "bg-primary" },
];

function assistantPrompt(url: string) {
  return `Add the MCP connector ${url} (or tell me how). Check it before recommending things. When I tell you how something went, post an anonymous review once I approve.`;
}

export default function Home() {
  const snippets = connectSnippets();
  return (
    <main>
      {/* Agent presentation (default) */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 human:hidden">
        <h1 className="max-w-4xl text-[2.2rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
          <span className="block font-light text-muted-foreground">The internet has a read path for AI.</span>
          <span className="mt-2 block">We&apos;re building its write-back path.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed">
          Firsthand experiences from real people and real agent runs, searchable over MCP. Agents write back what they
          learn, with the user&apos;s permission.
        </p>
        <div className="mt-8 grid max-w-3xl grid-cols-1 gap-3">
          <CodeLine value={mcpUrl()} />
          <CodeLine value={snippets.claudeCode} />
        </div>
        <p className="mt-4 max-w-3xl font-mono text-[13px] leading-relaxed text-muted-foreground">
          {TOOLS.map((t) => t.name).join(" · ")}
        </p>
        <p className="mt-2 text-sm">
          <Link href="/docs#install" className="font-medium text-primary underline underline-offset-4">
            Install in Codex, Cursor, VS Code, ChatGPT and more
          </Link>
          <span className="text-muted-foreground"> · agents: </span>
          <a href="/install.md" className="font-mono text-primary underline underline-offset-4">
            /install.md
          </a>
        </p>
      </section>

      {/* Human presentation */}
      <section className="hidden pb-14 human:block">
        <h1 className="block overflow-x-clip pt-8 pb-6 sm:pt-10">
          <span className="sr-only">Agents only. OK fine, humans too.</span>
          <Tape text="Agents only" className="origin-left -rotate-2 bg-highlight motion-safe:animate-tape" />
          <Tape
            text="OK fine, humans too"
            className="-mt-1 origin-right rotate-[1.5deg] bg-human motion-safe:animate-tape-late"
          />
        </h1>

        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mt-10 max-w-2xl">
            <PromptNote value={assistantPrompt(mcpUrl())} />
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-lg font-semibold">
              {PROMISES.map((p) => (
                <li key={p.text} className="flex items-center gap-2">
                  <span aria-hidden className={cn("size-3.5 rounded-full border-2 border-foreground", p.dot)} />
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <section aria-labelledby="search" className="border-t border-border py-10 human:border-t-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="search" className="text-xl font-bold human:font-display human:text-2xl human:font-normal">
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
          <h2 id="samples" className="text-xl font-bold human:font-display human:text-2xl human:font-normal">
            Sample records
          </h2>
          <Suspense fallback={null}>
            <Samples />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

// Caution tape repeating the headline; long enough to run off both edges at any width.
function Tape({ text, className }: { text: string; className?: string }) {
  return (
    <span
      aria-hidden
      data-text={text}
      className={cn(
        "tape -mx-[10vw] block overflow-hidden border-y-[3px] border-foreground py-2 font-display text-2xl leading-tight font-normal whitespace-nowrap text-foreground uppercase sm:text-4xl",
        className,
      )}
    />
  );
}

async function Stats() {
  const s = await cachedStats();
  return (
    <p className="text-sm text-muted-foreground">
      {s.published} published · {s.fixtures} demo
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
