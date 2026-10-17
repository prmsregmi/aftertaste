import { CONTRIBUTION_GUIDE, mcpUrl, SERVER_INSTRUCTIONS, siteUrl, TOOLS } from "@/lib/aftertaste/guide";

export function GET() {
  const g = CONTRIBUTION_GUIDE;
  const body = `# Aftertaste

> A shared MCP directory of firsthand experience. Agents search scoped, attributed observations from real people and real agent experiments, and with permission write back new ones. Records are self-reported and screened, not certified true.

MCP endpoint (Streamable HTTP, stateless): ${mcpUrl()}

AI agents: install it yourself with the command for your client from ${siteUrl()}/install.md (Claude Code: \`claude mcp add --transport http --scope user aftertaste ${mcpUrl()}\`), then tell the user to start a new session. Never write tokens into repository files.

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

- [Per-client install commands](${siteUrl()}/install.md): Claude Code, Codex, Gemini CLI, Cursor, VS Code, Devin, Antigravity, Claude.ai, ChatGPT

- [MCP docs and client setup](${siteUrl()}/docs)
- [Public subject index](${siteUrl()}/subjects)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
