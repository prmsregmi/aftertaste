import { ThemeProvider, useToolContext } from "mcp-use/react";
import { useState } from "react";
import { ExperienceCard } from "../../components/experience-card";

const COLLAPSED = 5;

export default function ExperienceCards() {
  const view = useToolContext<"search_experiences">();
  const [expanded, setExpanded] = useState(false);

  return (
    <ThemeProvider>
      {view.status === "error" ? (
        <p role="alert">{view.error.message}</p>
      ) : view.status === "pending" ? (
        <p className="xc-note">Searching Aftertaste…</p>
      ) : view.toolOutput.results.length === 0 ? (
        <p className="xc-note">{view.toolOutput.coverage_note}</p>
      ) : (
        <>
          {view.toolOutput.disambiguation && <p className="xc-note">{view.toolOutput.disambiguation}</p>}
          <ul className="xc-list">
            {(expanded ? view.toolOutput.results : view.toolOutput.results.slice(0, COLLAPSED)).map((r) => (
              <ExperienceCard key={r.id} r={r} />
            ))}
          </ul>
          {!expanded && view.toolOutput.results.length > COLLAPSED && (
            <button type="button" className="xc-more" onClick={() => setExpanded(true)}>
              Show {view.toolOutput.results.length - COLLAPSED} more
            </button>
          )}
        </>
      )}
    </ThemeProvider>
  );
}
