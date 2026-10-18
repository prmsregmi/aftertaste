# Aftertaste: handoff

What still needs doing. Delete items when they're done.

## Context

- **Product**: "Word of mouth, from agent to agent." An MCP server where agents search and write back firsthand experiences, plus a small website.
- **Live**: https://aftertaste-ai.vercel.app, MCP at `/api/mcp`. Vercel project `aftertaste` (Hobby account `prestons-projects-ac5810a7`, CLI login `parinaadhi-3720`). Deploys are CLI only: `vercel deploy --prod --yes`.
- **Repo**: github.com/prmsregmi/aftertaste (private). Commit straight to `main` with no AI attribution. A teammate (ppastram) also pushes to `main`, so run `git pull --rebase` first.
- **Stack**:
  - Next.js 16.4 (Cache Components on).
  - mcp-use 2.10 embedded via `withMcpUse` + `createNextHandler`.
  - Drizzle + `pg` with pgvector on Neon.
  - AI SDK 7 through Vercel AI Gateway (Jev decisions, embeddings).
  - Business rules in `src/lib/aftertaste/`; screening in `integrity/`.
- **Env on Vercel**: Neon vars, `AFTERTASTE_HASH_SALT` (secret), and `SITE_URL=https://aftertaste-ai.vercel.app`, which pins canonical links and the MCP icon URLs.
- **Design direction**: very little visible text. The agent view is instinct.com-style; human mode is caution tapes, a notebook with "Copy AI instructions", and a floating search.
- **Production matches `main`** as of 2026-10-18. Migrations 0000–0005 are applied, the env is set (`GROQ_API_KEY`, `CRON_SECRET`, screening limits), and the first sweep ran.

## Remaining

1. **Inkbox verified-agent badge, live test.**
   - Needs two Inkbox Console identities with agent-scoped keys: the server's (`INKBOX_AGENT_HANDLE` / `INKBOX_API_KEY` on Vercel) and the test agent's (`E2E_INKBOX_HANDLE` / `E2E_INKBOX_API_KEY` in `.env.inkbox`). `pnpm e2e` runs the verification when the test agent's keys are present.
   - Unverified: the ISO format of the ledger `since` parameter, and whether Console-created identities count as "claimed".
2. **Network-layer check.** With `IPINFO_TOKEN` set, ASN and country should appear in `request_signals`; a real client (Claude Code) should fill `client_name`.
3. **Calibrate the screening thresholds** in `rubric.ts`, `behavior.ts`, `network.ts` and `pipeline.ts`: label 300–500 records and recalibrate.

**Optional: coding-agent loop.** `lookup_issue(signature, package, version)` (exact match on a normalized error signature, under 200 ms) and `report_outcome(experience_id, worked, environment)` (confirmations from distinct environments set `reproduced`), plus a Claude Code hook that looks up failed tool calls and writes back fixes after an error turns into success. Accept fixes only after observed success, never auto-run them, and redact agent records more strictly.

## Conventions and gotchas

- Run `pnpm lint && pnpm typecheck && pnpm test` before every commit. A security-review hook comments on commits; fix or explain each finding.
- The content layer is a decision model plus classifiers. Never add prompt-based LLM judges; this is a firm user requirement.
- The user rewrites MCP-facing text by hand: `SERVER_INSTRUCTIONS`, `CONTRIBUTION_GUIDE` and `TOOLS` in `guide.ts`, the tool descriptions in `src/mcp/server.ts` and the `.describe(...)` calls in `contracts.ts`. Don't edit them unprompted.
- Any architecture change updates `public/architecture.html` in the same commit.
- No wording anywhere may frame the product as a demo or unfinished.
- Never stage `.agents/`, `.claude/` or `skills-lock.json`; stage explicit paths.
- Never edit or copy `.env.local`; ask the user to change local env.
- Restart `pnpm dev` after changing `next.config.ts`, MCP views or global CSS.
- Copy and UI must be minimal; the user pushes back hard on verbosity.
- Vercel Hobby only allows daily crons.
- **Moderation**: `vercel env run -e production -- pnpm exec tsx scripts/review.ts list|approve|reject|sample|delete <id>`.
- **End-to-end check**: `MCP_URL=<host>/api/mcp pnpm e2e`. The spam step needs the screening models, because keyword rules no longer reject promotion. Delete its records afterwards.
- **Screening evaluation**: `DATABASE_URL=<local> pnpm exec dotenv -e .env.local -- tsx scripts/eval-screening.ts data/screening-eval.jsonl`. It calls the paid models (about a cent per run) and never touches the database. Rerun after any change to `rubric.ts`.
- **Reloading the dataset**: `vercel env run -e production -- pnpm exec tsx scripts/seed.ts --reset` wipes every table, including real contributors, then loads `data/experiences.jsonl` (2,145 records on 59 developer tools, each summary ending in `[SAMPLE FOR DEMO]`) and embeds it through AI Gateway.
- **`vercel env run`** layers `.env.local` over remote vars and misparses arguments containing `=` or bare paths. Always use the `-- pnpm exec ...` form.
- A leftover `next-server` process can keep port 3123 after `pkill -f "next start"`; kill it by PID before restarting.
