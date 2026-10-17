import Link from "next/link";
import { Suspense } from "react";
import { CodeLine, PromptNote } from "@/components/copy-button";
import { ExperienceRecord } from "@/components/experience-record";
import { SubjectSearchForm } from "@/components/subject-search-form";
import { connectSnippets, mcpUrl, TOOLS } from "@/lib/commons/guide";
import { cachedSamples, cachedStats } from "@/lib/commons/public-data";
import { cn } from "@/lib/utils";

const PROMISES = [
  { text: "Nothing is shared without your permission.", dot: "bg-highlight" },
  { text: "Names, contact details, order numbers removed.", dot: "bg-human" },
  { text: "Labeled as personal experience, never fact.", dot: "bg-primary text-primary-foreground" },
];

function assistantPrompt(url: string) {
  return `Add Experience Commons as a connector, or tell me how: ${url}
Check it before recommending products, places or services. When I say how something went, draft a review with my preferences, minus name and contacts. Share only after I approve.`;
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
          <p className="mt-8 max-w-2xl text-2xl leading-snug font-semibold text-balance sm:text-3xl">
            Your AI can share what you learned, so the next person gets answers, not guesses.
          </p>

          <div className="mt-12 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div>
              <PromptNote value={assistantPrompt(mcpUrl())} />
              <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
                By hand: paste <code className="font-mono text-foreground wrap-anywhere">{mcpUrl()}</code> in Claude
                (Customize › Connectors › Add custom connector) or ChatGPT (chatgpt.com/plugins › + › Add custom MCP
                server).
              </p>
            </div>

            <ul className="grid gap-5 sm:grid-cols-3 lg:mt-8 lg:grid-cols-1">
              {PROMISES.map((p) => (
                <li key={p.text} className="flex items-start gap-3 text-lg leading-snug font-semibold">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground",
                      p.dot,
                    )}
                  >
                    <svg viewBox="0 0 16 16" className="size-4">
                      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                  </span>
                  <span className="pt-1">{p.text}</span>
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
      className={cn(
        "-mx-[10vw] flex gap-12 overflow-hidden border-y-[3px] border-foreground py-2 font-display text-2xl leading-tight font-normal whitespace-nowrap text-foreground uppercase sm:text-4xl",
        className,
      )}
    >
      {Array.from({ length: 16 }, (_, i) => (
        <span key={i}>{text}</span>
      ))}
    </span>
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
