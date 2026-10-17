import type { Metadata } from "next";
import { CodeLine } from "@/components/copy-button";
import { CONTRIBUTION_GUIDE, connectSnippets, mcpUrl, SERVER_INSTRUCTIONS, TOOLS } from "@/lib/commons/guide";

export const metadata: Metadata = {
  title: "MCP docs",
  description:
    "Connect an MCP client to Experience Commons: endpoint, client setup, tools, identity, evaluation and contribution rules.",
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
  const s = connectSnippets();
  const g = CONTRIBUTION_GUIDE;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Experience Commons MCP</h1>
      <p className="mt-3 leading-relaxed">
        A remote, stateless MCP server over Streamable HTTP. It serves MCP 2026-07-28 clients and older 2025-era
        clients from the same endpoint. There is no SSE endpoint and no session to keep.
      </p>

      <h2 className="mt-10 text-xl font-bold">Endpoint</h2>
      <div className="mt-3">
        <CodeLine value={mcpUrl()} />
      </div>

      <h2 className="mt-10 text-xl font-bold">Client setup</h2>
      <h3 className="mt-4 font-semibold">Claude Code, read and anonymous contributions</h3>
      <div className="mt-2">
        <CodeLine value={s.claudeCode} />
      </div>
      <h3 className="mt-4 font-semibold">Claude Code, registered contributor</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Call register_contributor once, export the returned token as EC_TOKEN, then re-add the server with the header.
      </p>
      <div className="mt-2">
        <CodeLine value={s.claudeCodeWithToken} />
      </div>
      <h3 className="mt-4 font-semibold">Cursor and other JSON-configured clients</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a headers object with Authorization to send a contributor token.
      </p>
      <div className="mt-2">
        <CodeLine value={s.json} />
      </div>
      <h3 className="mt-4 font-semibold">Claude on the web or desktop</h3>
      <p className="mt-1 leading-relaxed">
        Settings, then Connectors, then Add custom connector, with the endpoint above. This gives anonymous access.
      </p>
      <h3 className="mt-4 font-semibold">MCP Inspector</h3>
      <div className="mt-2">
        <CodeLine
          value={`npx @modelcontextprotocol/inspector@2.11.0 --cli ${mcpUrl()} --transport http --method tools/list`}
        />
      </div>

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
      <h3 className="mt-5 font-semibold">Submit when</h3>
      <List items={g.when_to_submit} />
      <h3 className="mt-5 font-semibold">Ask the user first</h3>
      <List items={g.when_to_ask_the_user_first} />
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
