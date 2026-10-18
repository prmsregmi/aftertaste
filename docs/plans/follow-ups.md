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

## Now

1. **Network-layer check**:
   - with `IPINFO_TOKEN` set, ASN and country should appear in `request_signals`;
   - a real client (Claude Code) should fill `client_name`.
2. **Known gaps**:
   - The thresholds in `rubric.ts`, `behavior.ts`, `network.ts` and `pipeline.ts` are uncalibrated; label 300–500 records and recalibrate.
   - The cron is daily because Hobby rejects more frequent schedules.

## Hackathon tracks

Three sponsor tracks.

| Track | Prize | Still needed |
|---|---|---|
| Manufact, "Best MCP server for agents" | 1st $2,000 + $6,000 credits | Item 2. Be ready to explain why it's on Vercel, not Manufact cloud: one deployment, no free-tier cold starts. |
| Armature, "Build something agents use" (coding agents, no human in the loop) | Winner $2,000, runner-up $1,000 | Item 2; optionally item 4. The README no longer names Armature or the no-401 and policy-as-data points; restore them if this track matters. |
| Inkbox, persistent agent identity | 1st $1,000 + $1,000 credits | Item 3. Production has no Inkbox keys, so `verify_agent_identity` fails there today. |

Skipped: Primitive (email; the follow-up email design below would be its entry), Blaxel, InstaBox.

## Backlog

### 1. MCP descriptions (the user rewrites these by hand)
Don't edit these texts unprompted. They live in:
- `SERVER_INSTRUCTIONS`, `CONTRIBUTION_GUIDE` and `TOOLS` in `src/lib/aftertaste/guide.ts`;
- the tool descriptions in `src/mcp/server.ts`;
- the `.describe(...)` calls in `contracts.ts`.

After editing, run the checks, commit and deploy. Clients pick up changes on their next connection.

### 2. Realistic dataset (blocked on one decision)
- **Now**: `data/experiences.jsonl` holds 10,000 records on 59 real developer tools, filled from four sentence templates, so any reader spots them as generated.
- **Replacement**: about 2,100 records, one Haiku agent per tool, written from `SPEC.md`-style rules and per-tool fact sheets, validated with `submissionSchema` + `evaluateSubmission`, loaded with `scripts/seed.ts --reset`. Seed loads embed through AI Gateway.
- **Open**: realistic generated records about real companies, unlabeled, read as fake firsthand reviews. Label them as samples in MCP results and pages, use invented tools, or keep only real runs.
- **Guardrail in place**: subject pages whose records are all seed records are `noindex` and left out of the sitemap.

### 3. Inkbox verified-agent badge, live test (Inkbox)
- **Needs**: two Inkbox Console identities with agent-scoped keys.
  - The server's: `INKBOX_AGENT_HANDLE` / `INKBOX_API_KEY` on Vercel.
  - The test agent's: `E2E_INKBOX_HANDLE` / `E2E_INKBOX_API_KEY` in `.env.inkbox`.

  `pnpm e2e` runs the verification when the test agent's keys are present.
- **Unverified**: the ISO format of the ledger `since` parameter, and whether Console-created identities count as "claimed".

### 4. Coding-agent loop (optional, Armature)
`lookup_issue(signature, package, version)` and `report_outcome(experience_id, worked, environment)`, plus error-signature normalization and a Claude Code hook. The design is under "Autonomous agents" below.

### 5. Later ideas (from the original brief)
- **Unanswered internet**: empty searches become demand signals.
- **Reality vs documentation**: observed behavior contrasted with official docs.
- **Freshness**: rechecks for fast-changing subjects.
- **Contradiction handling**: explain which variant or environment resolves conflicting records.
- **Follow-up market**: one narrow consented question to a prior contributor.
- **Evidence receipts**: verifiable purchase or test attestations.
- **Impact ledger**: how often a contribution helped.
- **Contributor control**: depublish, correction history, private team scopes.
- **Reputation by reproducible evidence.**
- **Sharing modes**: public, org-only, licensed.
- **Distribution**: client skills and one-click installs.

## Design: getting experiences written back later (not built)

Most experiences happen after the conversation that could have captured them. Aftertaste only sees tool calls inside sessions the client starts; MCP 2026-07-28 removed server-to-client push, so the nudge has to live in tool responses.

### Cloud chatbots

What platforms offer (verified 2026-10-17):
- **ChatGPT scheduled tasks**: whether they can call custom MCP apps is unconfirmed.
- **Claude.ai**: no chat scheduler, but the Google Calendar connector can create events when the user connected it.
- **Gemini scheduled actions**: available on Pro and Ultra.
- **Google Calendar template links**: work in any client.
- **Prefilled-chat links**: undocumented; don't rely on them.

Plan:
1. **`follow_up` block** in `search_experiences` (empty results) and decision responses. It carries an ask-after date, a question, an `offer` telling the model to schedule a task or calendar event if it can, an `add_to_calendar_url` and a `review_url`. Every path needs one "yes" from the user.
2. **One-tap review page `/r/<token>`**. The token encodes subject, gap and expiry, never the user. The person writes the review themselves, and it goes through the normal evaluator.
3. **Gap log** (`gaps` table) with a `gap_id`, to measure "gap filled".
4. **Opt-in email reminder**. One reminder, sent through Inkbox mail or Resend. The contact sits in its own table and is deleted after sending or after 14 days.
5. **Gap subscribers**: notify people who asked once the gap is filled, opt-in email only.

Test first: whether ChatGPT creates a scheduled task from the block and whether that task calls our app, whether Claude creates the calendar event, and click-through on the calendar link versus no nudge.

### Autonomous agents

Triggers are the agent's own work events:

| Event | Action |
|---|---|
| A tool call fails | Look up by normalized error signature |
| An error, then success | Write back the fix |
| Behavior differs from the docs | Write back the observed behavior |
| A measured comparison | Write back the measurements |
| A retrieved record was applied | Report the outcome |

Build:
- `lookup_issue` (exact match, under 200 ms) and `report_outcome` (confirmations from distinct environments set `reproduced`);
- signature normalization;
- an org sharing policy;
- a Claude Code plugin with hooks;
- a trace exporter.

Risks: flooding (accept fixes only after observed success), poisoned fixes (never auto-run; require confirmations), and leakage (stronger redaction for agent records).

## Architecture page

- **Location**: `public/architecture.html`, served at `/architecture.html` (noindex). Any architecture change updates it in the same commit.
- **How it's built**: one self-contained file. Inline SVG is built from `NODES`/`EDGES` arrays plus a detail drawing per node, with no build step.
- **Claude artifact mirror** (https://claude.ai/artifact/AvXJG1Pe59z8V1YVznoy1E): behind. Refresh it by reading it with the Artifact tool, then publishing with that `url`, without the outer document wrapper.

## Conventions and gotchas

- Run `pnpm lint && pnpm typecheck && pnpm test` before every commit. A security-review hook comments on commits; fix or explain each finding.
- The content layer is a decision model plus classifiers. Never add prompt-based LLM judges; this is a firm user requirement.
- Every model call goes through Vercel AI Gateway (Prompt Guard on Groq is the one exception). Never call OpenAI directly or ask for `OPENAI_API_KEY`.
- No wording anywhere may frame the product as a demo or unfinished.
- Never stage `.agents/`, `.claude/` or `skills-lock.json`; stage explicit paths.
- Never edit or copy `.env.local`; ask the user to change local env.
- Restart `pnpm dev` after changing `next.config.ts`, MCP views or global CSS.
- Copy and UI must be minimal; the user pushes back hard on verbosity.
- **Moderation**: `vercel env run -e production -- pnpm exec tsx scripts/review.ts list|approve|reject|sample|delete <id>`.
- **End-to-end check**: `MCP_URL=<host>/api/mcp pnpm e2e`. The spam step needs the screening models, because keyword rules no longer reject promotion. Delete its records afterwards.
- **Screening evaluation**: `DATABASE_URL=<local> pnpm exec dotenv -e .env.local -- tsx scripts/eval-screening.ts data/screening-eval.jsonl`. It calls the paid models (about a cent per run) and never touches the database. Rerun after any change to `rubric.ts`.
- **Reloading the dataset**: `vercel env run -e production -- pnpm exec tsx scripts/seed.ts --reset` wipes every table, including real contributors.
- **`vercel env run`** layers `.env.local` over remote vars and misparses arguments containing `=` or bare paths. Always use the `-- pnpm exec ...` form.
- A leftover `next-server` process can keep port 3123 after `pkill -f "next start"`; kill it by PID before restarting.
