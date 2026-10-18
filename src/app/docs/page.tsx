import type { Metadata } from "next";
import { CodeLine } from "@/components/copy-button";
import { CONTRIBUTION_GUIDE, installTargets, mcpUrl, SERVER_INSTRUCTIONS, TOOLS } from "@/lib/aftertaste/guide";

export const metadata: Metadata = {
  title: "MCP docs",
  description:
    "Connect an MCP client to Aftertaste: endpoint, client setup, tools, identity, evaluation and contribution rules.",
  alternates: { canonical: "/docs" },
};

function List({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default function DocsPage() {
  const g = CONTRIBUTION_GUIDE;
  return (
    <main className="max-w-[56rem] px-6 pt-12 pb-10 sm:px-12 lg:px-16">
      <h1 className="text-3xl font-bold">Aftertaste MCP</h1>
      <p className="mt-3 leading-relaxed">
        A remote, stateless MCP server over Streamable HTTP. It serves MCP 2026-07-28 clients and older 2025-era
        clients from the same endpoint. There is no SSE endpoint and no session to keep.
      </p>

      <h2 className="mt-10 text-xl font-bold">Endpoint</h2>
      <div className="mt-3">
        <CodeLine value={mcpUrl()} />
      </div>

      <h2 id="install" className="mt-10 scroll-mt-6 text-xl font-bold">
        Install
      </h2>
      <p className="mt-2 leading-relaxed">
        Agents can install it themselves from <a href="/install.md" className="font-medium text-primary underline underline-offset-4">/install.md</a>.
        Each setup command issues a contributor token and installs the server with it.
      </p>
      {installTargets().map((t) => (
        <section key={t.client} className="mt-6">
          <h3 className="font-semibold">{t.client}</h3>
          <div className="mt-2">
            <CodeLine value={t.setup} />
          </div>
          {t.note && <p className="mt-2 text-sm text-muted-foreground">{t.note}</p>}
        </section>
      ))}

      <h2 className="mt-10 text-xl font-bold">Tools</h2>
      <dl className="mt-3 divide-y divide-border border-y border-border">
        {TOOLS.map((t) => (
          <div key={t.name} className="py-3">
            <dt>
              <code className="font-mono text-sm font-semibold">{t.name}</code>
            </dt>
            <dd className="mt-0.5 text-muted-foreground">{t.summary}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-bold">Server instructions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sent to every client on connect. Hosts decide whether to surface them to the model.
      </p>
      <div className="mt-3 rounded-md border border-border bg-card p-4 leading-relaxed whitespace-pre-line">
        {SERVER_INSTRUCTIONS}
      </div>

      <h2 id="contribute" className="mt-10 scroll-mt-6 text-xl font-bold">
        Contribution rules
      </h2>
      <p className="mt-2 leading-relaxed">{g.purpose}</p>
      <h3 className="mt-5 font-semibold">Offer to contribute when</h3>
      <List items={g.when_to_submit} />
      <h3 className="mt-5 font-semibold">Permission</h3>
      <List items={g.permission} />
      <h3 className="mt-5 font-semibold">Never submit</h3>
      <List items={g.never_submit} />
      <h3 className="mt-5 font-semibold">Claim format</h3>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
        {Object.entries(g.claim_format).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-sm">{k}</dt>
            <dd className="leading-relaxed">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-bold">Identity</h2>
      <List items={g.attribution_and_identity} />

      <h2 className="mt-10 text-xl font-bold">Evaluation</h2>
      <p className="mt-2 leading-relaxed">{g.evaluation}</p>
      <p className="mt-2 leading-relaxed">
        Evidence tiers describe what exists, not whether a claim is true: firsthand_unverified (no evidence),
        evidence_attached (the contributor described or hashed an artifact; not checked), reproduced (a moderator
        confirmed an independent reproduction).
      </p>
    </main>
  );
}
