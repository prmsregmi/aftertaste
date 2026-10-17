import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PublicRecord {
  id: string;
  subjectName: string;
  subjectSlug: string;
  summary: string;
  variant: string | null;
  sourceType: string;
  evidenceTier: string;
  observedOn: string | null;
  isDemoFixture: boolean;
  aspects: string[];
  preferences: Record<string, string>;
  caveat: string;
  contributor: { kind: "seed" | "anonymous" | "registered"; label: string | null; verified_agent: string | null };
}

const SOURCE_LABEL: Record<string, string> = {
  human_firsthand: "Firsthand report",
  agent_experiment: "Agent experiment",
};

const EVIDENCE_LABEL: Record<string, string> = {
  firsthand_unverified: "unverified",
  evidence_attached: "evidence described, not checked",
  reproduced: "independently reproduced",
};

export function ExperienceRecord({ record }: { record: PublicRecord }) {
  const meta = [
    SOURCE_LABEL[record.sourceType],
    EVIDENCE_LABEL[record.evidenceTier],
    record.observedOn,
  ].filter(Boolean);

  return (
    <article
      className={cn(
        "border-l-4 bg-card py-4 pr-4 pl-5 human:rounded-r-xl",
        record.sourceType === "agent_experiment" && "border-experiment",
        record.sourceType === "human_firsthand" && "border-firsthand",
      )}
    >
      <p className="text-sm">
        <Link href={`/subjects/${record.subjectSlug}`} className="font-semibold underline-offset-4 hover:underline">
          {record.subjectName}
        </Link>
        {record.variant && <span className="text-muted-foreground">, {record.variant}</span>}
      </p>
      <p className="mt-1.5 max-w-prose leading-relaxed">{record.summary}</p>
      {Object.keys(record.preferences).length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Reviewer:{" "}
          {Object.entries(record.preferences)
            .map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`)
            .join(" · ")}
        </p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>{meta.join(" · ")}</span>
        {record.contributor.kind === "registered" && <span>· {record.contributor.label}</span>}
        {record.contributor.verified_agent && (
          <span
            title="This contributor proved control of an Inkbox agent identity. It does not verify the claim."
            className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-3">
              <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            Verified agent {record.contributor.verified_agent.split(" ")[0]}
          </span>
        )}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{record.caveat}</p>
    </article>
  );
}
