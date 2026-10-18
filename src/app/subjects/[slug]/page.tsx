import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CodeLine } from "@/components/copy-button";
import { ExperienceRecord } from "@/components/experience-record";
import { cachedSubjectSlugs, cachedSubjectTeaser } from "@/lib/aftertaste/public-data";

export async function generateStaticParams() {
  return (await cachedSubjectSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/subjects/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const teaser = await cachedSubjectTeaser(slug);
  if (!teaser) return { title: "Subject not found", robots: { index: false } };
  return {
    title: teaser.subject.name,
    description: `${teaser.publishedCount} firsthand experience record(s) about ${teaser.subject.name}, covering ${teaser.aspects.join(", ")}. Retrieve them over MCP.`,
    alternates: { canonical: `/subjects/${slug}` },
  };
}

export default function SubjectPage(props: PageProps<"/subjects/[slug]">) {
  return (
    <main className="max-w-[60rem] px-6 pt-12 pb-10 sm:px-12 lg:px-16">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading subject</p>}>
        <SubjectDetail params={props.params} />
      </Suspense>
    </main>
  );
}

async function SubjectDetail({ params }: Pick<PageProps<"/subjects/[slug]">, "params">) {
  const { slug } = await params;
  const teaser = await cachedSubjectTeaser(slug);
  if (!teaser) notFound();
  const { subject } = teaser;
  const query = `search_experiences({ "query": ${JSON.stringify(subject.name)} })`;

  return (
    <>
      <h1 className="text-3xl font-bold text-balance">{subject.name}</h1>
      {teaser.activityNotice && (
        <p role="status" className="mt-3 max-w-xl rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {teaser.activityNotice}
        </p>
      )}
      <dl className="mt-4 grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Published experiences</dt>
        <dd>{teaser.publishedCount}</dd>
        <dt className="text-muted-foreground">Sources</dt>
        <dd>{teaser.sourceTypes.map((s) => s.replace("_", " ")).join(", ")}</dd>
        <dt className="text-muted-foreground">Aspects reported</dt>
        <dd>{teaser.aspects.join(", ")}</dd>
        {subject.location && (
          <>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{subject.location}</dd>
          </>
        )}
      </dl>

      {teaser.samples.length > 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-bold">Public samples</h2>
          {teaser.samples.map((record) => (
            <ExperienceRecord key={record.id} record={record} />
          ))}
        </section>
      )}

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Query via MCP</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {teaser.mcpOnlyCount > 0
            ? `${teaser.mcpOnlyCount} more record(s) with full observations, conditions and caveats are available to connected agents.`
            : "Connected agents get the full structured record, including conditions and caveats."}
        </p>
        <div className="mt-3">
          <CodeLine value={query} />
        </div>
      </section>
    </>
  );
}
