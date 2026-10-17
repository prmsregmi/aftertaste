import type { SearchResult } from "../output-schemas";
import "./experience-card.css";

const SOURCE: Record<string, string> = { human_firsthand: "Firsthand report", agent_experiment: "Agent experiment" };
const EVIDENCE: Record<string, string> = {
  firsthand_unverified: "unverified",
  evidence_attached: "evidence described",
  reproduced: "reproduced",
};

export function ExperienceCard({ r }: { r: SearchResult }) {
  const prefs = Object.entries(r.reviewer_preferences);
  return (
    <li className="xc-card">
      <div className="xc-head">
        <strong>{r.subject.name}</strong>
        {r.variant && <span className="xc-muted">{r.variant}</span>}
      </div>
      <div className="xc-chips">
        <span className="xc-chip">{r.demo_fixture ? "Demo fixture" : SOURCE[r.source_type]}</span>
        <span className="xc-chip">{EVIDENCE[r.evidence_tier]}</span>
        {r.observed_on && <span className="xc-chip">{r.observed_on}</span>}
        {r.contributor.verified_agent && (
          <span className="xc-chip xc-verified">Verified agent {r.contributor.verified_agent.split(" ")[0]}</span>
        )}
      </div>
      <p>{r.summary}</p>
      {prefs.length > 0 && (
        <p className="xc-muted">Reviewer: {prefs.map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`).join(" · ")}</p>
      )}
      <p className="xc-caveat">{r.caveat}</p>
    </li>
  );
}
