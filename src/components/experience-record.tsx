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
  caveat: string;
}

const SOURCE_LABEL: Record<string, string> = {
  human_firsthand: "Firsthand human report",
  agent_experiment: "Agent experiment",
};

const EVIDENCE_LABEL: Record<string, string> = {
  firsthand_unverified: "Unverified",
  evidence_attached: "Evidence described, not checked",
  reproduced: "Independently reproduced",
};

export function ExperienceRecord({ record }: { record: PublicRecord }) {
  return (
    <article
      className={cn(
        "border-l-4 bg-card py-4 pr-4 pl-5",
        record.isDemoFixture && "border-fixture bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgb(148_96_15/0.05)_10px_20px)]",
        !record.isDemoFixture && record.sourceType === "agent_experiment" && "border-experiment",
        !record.isDemoFixture && record.sourceType === "human_firsthand" && "border-firsthand",
      )}
    >
      <p className="text-sm text-muted-foreground">
        <Link href={`/subjects/${record.subjectSlug}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          {record.subjectName}
        </Link>
        {record.variant && <span>, {record.variant}</span>}
      </p>
      <p className="mt-1.5 max-w-prose leading-relaxed">{record.summary}</p>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Source</dt>
          <dd className={cn(record.isDemoFixture ? "font-semibold text-fixture" : "font-medium")}>
            {record.isDemoFixture ? "Demo fixture" : SOURCE_LABEL[record.sourceType]}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Evidence</dt>
          <dd>{EVIDENCE_LABEL[record.evidenceTier]}</dd>
        </div>
        {record.observedOn && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Observed</dt>
            <dd>{record.observedOn}</dd>
          </div>
        )}
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Aspects</dt>
          <dd>{record.aspects.join(", ")}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">{record.caveat}</p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">get_experience {record.id}</p>
    </article>
  );
}
