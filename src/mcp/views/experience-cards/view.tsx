import { ThemeProvider, useToolContext } from "mcp-use/react";
import { ExperienceCard } from "../../components/experience-card";

export default function ExperienceCards() {
  const view = useToolContext<"search_experiences">();

  return (
    <ThemeProvider>
      {view.status === "error" ? (
        <p role="alert">{view.error.message}</p>
      ) : view.status === "pending" ? (
        <p className="xc-note">Searching the Commons…</p>
      ) : view.toolOutput.results.length === 0 ? (
        <p className="xc-note">{view.toolOutput.coverage_note}</p>
      ) : (
        <>
          {view.toolOutput.disambiguation && <p className="xc-note">{view.toolOutput.disambiguation}</p>}
          <ul className="xc-list">
            {view.toolOutput.results.map((r) => (
              <ExperienceCard key={r.id} r={r} />
            ))}
          </ul>
        </>
      )}
    </ThemeProvider>
  );
}
