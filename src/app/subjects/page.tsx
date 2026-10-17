import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SubjectSearchForm } from "@/components/subject-search-form";
import { searchSubjectTeasers } from "@/lib/aftertaste/service";

export const metadata: Metadata = {
  title: "Subjects",
  description: "Public index of products, places, processes and software that have firsthand experience records.",
  alternates: { canonical: "/subjects" },
};

const KIND_LABEL: Record<string, string> = {
  physical_product: "Product",
  software: "Software",
  place: "Place",
  process: "Process",
  service: "Service",
  other: "Other",
};

export default function SubjectsPage(props: PageProps<"/subjects">) {
  return (
    <main className="max-w-[60rem] px-6 pt-12 pb-10 sm:px-12 lg:px-16">
      <h1 className="text-3xl font-bold">Subjects</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Every subject with at least one published experience. This index shows names and the aspects people reported
        on; the records themselves are retrieved over MCP.
      </p>
      <div className="mt-6 max-w-xl">
        <Suspense fallback={<SubjectSearchForm />}>
          <SearchFormWithQuery searchParams={props.searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={<p className="mt-8 text-sm text-muted-foreground">Searching</p>}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function queryOf(searchParams: PageProps<"/subjects">["searchParams"]) {
  const q = (await searchParams).q;
  return (typeof q === "string" ? q : "").trim().slice(0, 100);
}

async function SearchFormWithQuery({ searchParams }: Pick<PageProps<"/subjects">, "searchParams">) {
  return <SubjectSearchForm defaultValue={await queryOf(searchParams)} />;
}

async function Results({ searchParams }: Pick<PageProps<"/subjects">, "searchParams">) {
  const q = await queryOf(searchParams);
  const rows = await searchSubjectTeasers(q);
  if (rows.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-border p-6">
        <p className="font-semibold">No published experiences match &ldquo;{q}&rdquo;.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          That is a gap worth filling. If you or your agent has firsthand experience, contribute it through
          submit_experience over MCP.
        </p>
      </div>
    );
  }
  return (
    <ul className="mt-8 divide-y divide-border border-y border-border">
      {rows.map((r) => (
        <li key={r.slug} className="py-4">
          <Link href={`/subjects/${r.slug}`} className="text-lg font-semibold underline-offset-4 hover:underline">
            {r.name}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {KIND_LABEL[r.kind]}, {r.published} published {r.published === 1 ? "experience" : "experiences"}
            {r.latest && `, latest observed ${r.latest}`}
          </p>
          {r.aspects.length > 0 && <p className="mt-1 text-sm">Aspects reported: {r.aspects.join(", ")}</p>}
        </li>
      ))}
    </ul>
  );
}
