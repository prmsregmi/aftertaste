# Aftertaste: handoff

What still needs doing. Delete items when they're done; decisions and their reasons go in `DECISIONS.md`, not here.

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
- **Production is behind `main`.** Nothing has been deployed since 2026-10-17. Migrations 0003–0005 are not applied to Neon.

## Now

1. **Connect Claude.ai and ChatGPT after deploying.** The sign-in flow passed locally against a simulated app: discovery, registration, Continue, the token exchange with PKCE, replay rejection and an MCP call with the issued token.
   - In Claude.ai: Customize, then Connectors, then Add custom connector, with "Register automatically" as the OAuth client.
   - In ChatGPT: Add custom MCP server with OAuth.
   - If a token is issued but the connector reports a failure, check Vercel Firewall events for a blocked `POST /api/mcp`.
   - BotID runs only on Vercel, so it is exercised for the first time there.
2. **Real-key checks.** All three providers stay on and get validated before rollout.

   **Setup.** Use the local DB: `docker start aftertaste-pg`, or create it with `docker run -d --name aftertaste-pg -e POSTGRES_PASSWORD=pg -p 54329:5432 pgvector/pgvector:pg16`. Then, in the shell only (never edit `.env.local`), export `DATABASE_URL=postgresql://postgres:pg@localhost:54329/postgres` and `AFTERTASTE_HASH_SALT=local`, and unset `DATABASE_URL_UNPOOLED`. Run `pnpm exec drizzle-kit migrate` and `pnpm exec tsx scripts/seed.ts` if the DB is new.

   **Test records.** Submit a clean record, a promotional one, a grudge, one with "ignore previous instructions...", and one naming a staff member. Then inspect each with `pnpm exec tsx scripts/integrity.ts screen <id>`. The target is under 3 s in total.
   - **Jev**: validated 2026-10-18 after a $10 credit top-up. The clean record published, the injection was rejected, the staff name was held and the grudge was held. Uncertain records were rerun on the backup model. A full screening takes about 1 second.
   - **Prompt Guard on Groq**: validated 2026-10-18. It returns a bare number, and the injection record scored 0.999 and was rejected while the others scored 0.001 or less, at 100–200 ms each. Still open: one non-English text over 1,500 characters, to see how Groq handles more than 512 tokens.
   - **OpenAI moderation**, with `OPENAI_API_KEY` from the user: the abusive record should raise `harassment_or_hate`.
   - **Network layer**:
     - `pnpm exec tsx scripts/integrity.ts ranges` should load the Tor, X4BNet, OpenAI-connector and Anthropic lists; the Tor and OpenAI fetches failed once in a sandbox;
     - with `IPINFO_TOKEN` set, ASN and country should appear in `request_signals`;
     - a real client (Claude Code) should fill `client_name`.
3. **Rollout** (the user deploys):
   1. `vercel env run -e production -- pnpm exec drizzle-kit migrate`, immediately followed by step 3. Migration 0004 renames `is_demo_fixture` to `is_seed`, so the live build's record queries fail until the new deploy lands.
   2. Add `GROQ_API_KEY`, `IPINFO_TOKEN` and `CRON_SECRET` on Vercel (`OPENAI_API_KEY` is optional; moderation stays off without it). AI Gateway uses OIDC there. `AFTERTASTE_SCREENING_PER_HOUR=200` and `AFTERTASTE_SCREENING_PER_WEEK=4000` are already set.
   3. `vercel deploy --prod --yes`.
   4. `vercel env run -e production -- pnpm exec tsx scripts/integrity.ts sweep` once.
   5. Optional: a Vercel WAF rate-limit rule on `/api/mcp`. Keep BotID and Bot Protection off that route.
4. **Known gaps**:
   - The thresholds in `rubric.ts`, `behavior.ts`, `network.ts` and `pipeline.ts` are uncalibrated; label 300–500 records and recalibrate.
   - Seed records have no embeddings, so paraphrase search only covers new records.
   - The cron is daily because Hobby rejects more frequent schedules.

## Hackathon tracks

Three sponsor tracks. Confirm with the organizers whether one project can enter several.

| Track | Prize | Still needed |
|---|---|---|
| Manufact, "Best MCP server for agents" | 1st $2,000 + $6,000 credits | Rollout, item 2, item 3. Be ready to explain why it's on Vercel, not Manufact cloud: one deployment, no free-tier cold starts. |
| Armature, "Build something agents use" (coding agents, no human in the loop) | Winner $2,000, runner-up $1,000 | Items 2 and 4; optionally item 6. The README no longer names Armature or the no-401 and policy-as-data points; restore them if this track matters. |
| Inkbox, persistent agent identity | 1st $1,000 + $1,000 credits | Item 5. Production has no Inkbox keys, so `verify_agent_identity` fails there today. |

Skipped: Primitive (email; the follow-up email design below would be its entry), Blaxel, InstaBox.

## Backlog

### 1. MCP descriptions (the user rewrites these by hand)
Don't edit these texts unprompted. They live in:
- `SERVER_INSTRUCTIONS`, `CONTRIBUTION_GUIDE` and `TOOLS` in `src/lib/aftertaste/guide.ts`;
- the tool descriptions in `src/mcp/server.ts`;
- the `.describe(...)` calls in `contracts.ts`;
- `description` in `server.json`.

After editing, run the checks, commit and deploy. Clients pick up changes on their next connection.

### 2. Realistic dataset (decided in principle; one conflict open)
- **Problem**: `data/experiences.jsonl` has invented subject names and fill-in-the-blank text whose slots don't fit (an izakaya "tried over a long project", a plumbing crew where "fridge cleaning stood out"). Agents quote it verbatim.
- **Labels**: MCP results no longer mark generated records (user decision, 2026-10-18), so generated records stay on invented subjects. Real subjects get only real measurements (for example agent operability or measured `agent_experiment` records).
- **Guardrails for any record about a real subject**:
  - `noindex` and leave them out of the sitemap (filter `is_seed`);
  - subjective aspects only (no hygiene, safety, legality or named people);
  - mixed sentiment.
- **Teardown after judging**: delete the `is_seed` records with their review events and flags, then orphaned subjects and contributors. Keep one published subject, or the build fails on an empty `generateStaticParams`.
- **Domains**:
  - restaurants: real Bay Area menus, price band, neighborhood;
  - shopping: real products and variants;
  - APIs, SDKs and SaaS: versions, method and measurements;
  - suggested: agent operability (API or MCP available? login wall or CAPTCHA? rate-limit headers, docs versus reality), which can be measured for real.
- **Generation**:
  1. Web-search subjects.
  2. Build a fact profile for each.
  3. Generate records with an LLM from that profile only.
  4. Validate with `submissionSchema` + `evaluateSubmission`, dedupe, and load with `scripts/seed.ts --reset`. Never load through `submit_experience`, which calls paid models.
- **Open for the user**: size (10k or 2–3k), whether operability is a domain, and which LLM and budget to use.

### 3. Check that MCP Apps cards render in real clients (Manufact)
Add the connector in Claude.ai (Customize → Connectors → Add custom connector) and run a search. Don't set `MCP_URL`, which changes asset origins.

### 4. Record the no-human onboarding walkthrough (Armature)
A coding agent reads `/llms.txt`, installs the server, searches, registers and submits an `agent_experiment` record. Afterwards, delete its records (`scripts/review.ts delete`), its contributor and any orphaned subject (one-off SQL through `vercel env run`).

### 5. Inkbox verified-agent badge, live test (Inkbox)
- **Needs**: two Inkbox Console identities with agent-scoped keys.
  - The server's: `INKBOX_AGENT_HANDLE` / `INKBOX_API_KEY` on Vercel.
  - The test agent's: `E2E_INKBOX_HANDLE` / `E2E_INKBOX_API_KEY` in `.env.inkbox`.

  `pnpm e2e` runs the verification when the test agent's keys are present.
- **Unverified**: the ISO format of the ledger `since` parameter, and whether Console-created identities count as "claimed".

### 6. Coding-agent loop (optional, Armature)
`lookup_issue(signature, package, version)` and `report_outcome(experience_id, worked, environment)`, plus error-signature normalization and a Claude Code hook. The design is under "Autonomous agents" below.

### 7. Publish to the official MCP Registry (optional)
`server.json` is ready (`io.github.prmsregmi/aftertaste`, with icons). Run `brew install mcp-publisher`, then `mcp-publisher login github` (device flow, needs the human), then `mcp-publisher publish`. Published versions are immutable, so bump `version` each time. Do item 1 first.

### 8. Smaller items
- A `correct_experience` / retract tool.
- Gap logging of empty searches.
- OAuth, so ChatGPT and Claude.ai users can contribute and get a metered identity. Check first that mcp-use keeps anonymous access alongside OAuth.
- Contribute one real agent-experiment record (the mcp-handler → mcp-use migration, with measured latency).
- Upgrade to mcp-use 2.10.1 (untested).
- Search allowance: size the defaults from real logs. Meter ChatGPT users individually by `_meta["openai/subject"]` (only when the IP is in OpenAI's range) once mcp-use exposes it; until then each platform shares a 5,000-a-day pool.

### 9. Later ideas (from the original brief)
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
- No wording anywhere may frame the product as a demo or unfinished.
- Never stage `.agents/`, `.claude/` or `skills-lock.json`; stage explicit paths.
- Never edit or copy `.env.local`; ask the user to change local env.
- Restart `pnpm dev` after changing `next.config.ts`, MCP views or global CSS.
- Copy and UI must be minimal; the user pushes back hard on verbosity.
- **Moderation**: `vercel env run -e production -- pnpm exec tsx scripts/review.ts list|approve|reject|sample|delete <id>`.
- **End-to-end check**: `MCP_URL=<host>/api/mcp pnpm e2e`. Locally, add `AFTERTASTE_SCREENING=off` unless you're testing models. Delete its records afterwards.
- **Reloading the dataset**: `vercel env run -e production -- pnpm exec tsx scripts/seed.ts --reset` wipes every table, including real contributors.
- **`vercel env run`** layers `.env.local` over remote vars and misparses arguments containing `=` or bare paths. Always use the `-- pnpm exec ...` form.
- A leftover `next-server` process can keep port 3123 after `pkill -f "next start"`; kill it by PID before restarting.
