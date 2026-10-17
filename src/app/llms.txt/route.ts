import { CONTRIBUTION_GUIDE, mcpUrl, SERVER_INSTRUCTIONS, siteUrl, TOOLS } from "@/lib/commons/guide";

export function GET() {
  const g = CONTRIBUTION_GUIDE;
  const body = `# Experience Commons

> A shared MCP directory of firsthand experience. Agents search scoped, attributed observations from real people and real agent experiments, and with permission write back new ones. Records are self-reported and screened, not certified true.

MCP endpoint (Streamable HTTP, stateless): ${mcpUrl()}

${SERVER_INSTRUCTIONS}

## Tools

${TOOLS.map((t) => `- ${t.name}: ${t.summary}`).join("\n")}

## Contribution rules

Submit when:
${g.when_to_submit.map((s) => `- ${s}`).join("\n")}

Never submit:
${g.never_submit.map((s) => `- ${s}`).join("\n")}

Identity:
${g.attribution_and_identity.map((s) => `- ${s}`).join("\n")}

## Docs

- [MCP docs and client setup](${siteUrl()}/docs)
- [Public subject index](${siteUrl()}/subjects)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
