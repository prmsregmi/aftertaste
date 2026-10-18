# Aftertaste: handoff

Tracked in git. It is the source of truth for the next agent; keep it current instead of relying on chat history.

## Where things stand (2026-10-18)

- **Product**: Aftertaste (renamed from Experience Commons). "Word of mouth, from agent to agent." An MCP server where agents search and write back firsthand experiences, plus a small website.
- **Live**: https://aftertaste-ai.vercel.app (old alias experience-commons.vercel.app still serves). MCP endpoint `/api/mcp`. Vercel project `aftertaste` on team `prestons-projects-ac5810a7`, CLI login `parinaadhi-3720`. Deploys are CLI only: `vercel deploy --prod --yes` (no Git integration).
- **Repo**: github.com/prmsregmi/aftertaste. The user wants commits straight on `main`, no AI attribution in commits. A teammate (ppastram) also pushes to `main`, so `git pull --rebase` before pushing.
- **Stack**: Next.js 16.4 App Router (Cache Components on), mcp-use 2.10 embedded via `withMcpUse` + `createNextHandler` (`src/mcp/server.ts`), Drizzle + `pg` Pool with pgvector, Tailwind v4 + shadcn. Business rules in `src/lib/aftertaste/` (contracts, evaluate, service, guide, inkbox, and `integrity/` for the screening layers). `ai` 7 through Vercel AI Gateway for Jev decisions (`experimental_decide`) and embeddings. mcp-use bundles the MCP server with its own Next shims, so `after()` from `next/server` fails the build there; use `waitUntil` from `@vercel/functions`.
- **Database**: Neon (Vercel Marketplace store `experience-commons-db`), holding only the synthetic dataset: 10,000 published public records, 300 subjects, 650 pseudonymous contributors (loaded 2026-10-17 with `scripts/seed.ts --reset`). Its text is template-generated and often incoherent; replacing it with real-world subjects is item 2.
- **Env on Vercel**: Neon vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PG*`), `AFTERTASTE_HASH_SALT` (secret; salts IP hashes and Inkbox challenge signatures), `SITE_URL=https://aftertaste-ai.vercel.app` (pins canonical links).
- **Architecture page**: `/architecture.html` (noindex) and https://claude.ai/artifact/AvXJG1Pe59z8V1YVznoy1E (source in the session scratchpad; the public copy is `public/architecture.html`).
- **Logo**: the header's hand-drawn arrow mark on an ink tile (`public/logo.svg`, `public/logo.png` at 512 px). It is also the favicon (`src/app/favicon.ico`), the `icons` the MCP server reports in `serverInfo`, and the icons in `server.json`. The icon URLs come from `siteUrl()`, so they point at production only when `SITE_URL` is set. To regenerate the PNG and ICO after editing the SVG, render with sharp (bundled with Next).
- **Design direction from the user**: very little visible text. Agent view is instinct.com-style (left-anchored serif, manifesto, connect commands). Human mode ("I am Human" toggle) is only caution tapes, a notebook with a "Copy AI instructions" button plus robot sticker, and a floating search.

## Working state at handoff (2026-10-18)

- `main` is ahead of production. Nothing has been deployed since 2026-10-17 and migration `0003_integrity` is **not** applied to Neon. Do not deploy until item 0b step 5 passes with real keys. Steps 1–4 passed locally on 2026-10-18 (Docker pgvector). The attack simulation and the clean-seed sweep matched the expected results. The demo matched too, except that `.env.local` gateway credentials made the registered record hold with `screening_incomplete` because of the billing error in item 0.
- Already done on `main` (no action needed):
  - Server instructions, at the user's request: the PERMISSION paragraph and the synthetic-demo note were removed, and a line was added saying Aftertaste complements Context7, web search, APIs and forums. The `evaluation` sentence in `CONTRIBUTION_GUIDE` was updated to mention the new screening.
  - Integrity layer in `src/lib/aftertaste/integrity/`:
    - `rubric.ts`: ten harm questions, fusion and reject/hold thresholds.
    - `classifiers.ts`: Jev decisions, Prompt Guard, moderation and embeddings (item 0).
    - `network.ts`, `network-db.ts`: IP lists, IPinfo ASN, spoofed-client and token-farming signals, hashed `request_signals`.
    - `behavior.ts`, `sweep.ts`: Poisson bursts, polarity shifts, lockstep groups, shared /24, Beta trust, ranking weights, quarantine.
    - `pipeline.ts`: per-submission assembly, plus pgvector paraphrase search.
  - Wiring for the integrity layer:
    - `service.ts`: `submitExperience`, `registerContributor`, `flagExperience`, the search weights and activity notices, and `rescreenPending`.
    - `src/mcp/server.ts`: builds the request fingerprint.
    - Cron route `/api/cron/integrity` (daily, `vercel.json`).
    - CLIs: `scripts/integrity.ts` (`pnpm integrity ...`) and `scripts/simulate-attack.ts`.
    - Subject-page notice, architecture page, README and DECISIONS.
  - Verified in a cloud sandbox against Postgres 16 with pgvector: lint, typecheck, 43 unit tests, `next build`, and the MCP demo (`scripts/demo.mts`) against `pnpm start`. The attack simulation ran 8 accounts × 3 subjects: 3 registrations were refused, all 24 records were held or quarantined, the burst, polarity-shift, lockstep and shared-infrastructure findings fired, and the notice appeared in search. A sweep over the clean seed data produced zero findings. Content providers were tested with fakes only; no real API call has ever been made.

## 0. Classifier content layer (done 2026-10-18, real-key smoke test pending)

**Background.** The user asked from the start for classifier models ("a JEV model or binary models that can answer yes or no with confidence, or a model trained to just classify"), not prompts to an LLM. A previous agent built Claude Haiku votes plus Opus escalation instead, and the user was very frustrated. Never reintroduce prompt-based judges; describe the layer as a decision model plus classifiers.

**What was built** (user choices from 2026-10-18 in brackets):
- `src/lib/aftertaste/integrity/classifiers.ts` (was `judges.ts`):
  - **Jev**, TypeSafe AI's decision model [confirmed as "JEV"]. It is pinned to `typesafe-ai/jev-1.13.0`, the stable release with full zero data retention; 1.14.0 is a preview. It is called through AI Gateway with `experimental_decide` (AI SDK 7). All ten `QUESTIONS` are boolean questions and each returns P(yes). The state is the `CONTEXT` text plus the record as JSON. The JSON must be plain, because undefined values fail validation.
  - **Escalation** [retry on a second decision model]. When any answer falls between 0.3 and 0.7, AI Gateway's conditional fallback (`providerOptions.gateway.models`) reruns the whole decision on `openai/gpt-6-luna-decisions`. The gateway returns only the fallback's answers, and the `decision` layer's result records which model answered. Override with `AFTERTASTE_DECISION_MODEL` and `AFTERTASTE_DECISION_FALLBACK_MODEL`; `microsoft/microsoft-decision-1` is a cheaper alternative with full ZDR.
  - **Prompt injection** [Prompt Guard + Jev]. Llama Prompt Guard 2 86M on Groq (`GROQ_API_KEY`, `AFTERTASTE_INJECTION_MODEL`) scores every free-text field in 1,500-character windows with 200 overlap and keeps the maximum. It can only raise Jev's `instructions_to_ai` estimate. Groq lists the model as preview.
  - **Abuse**: OpenAI moderation, unchanged. It can only raise `harassment_or_hate`.
  - Screening is complete when Jev answered. The supporting classifiers stay optional.
- `@anthropic-ai/sdk` and the `ANTHROPIC_API_KEY` / `AFTERTASTE_JUDGE_MODEL` / `AFTERTASTE_SECOND_MODEL` / `AFTERTASTE_ESCALATION_MODEL` variables are gone. The README, DECISIONS, architecture page and CLI help were reworded.
- Tests: `classifiers.test.ts`, including one through the real `experimental_decide` with `Experimental_DecisionMockModelV4`.

**Remaining checks** (decided 2026-10-18: all three providers stay on, and all are validated before rollout):
1. **Jev, after the card is added.** The user is adding a card to the Vercel account (Hobby plan; the card only unlocks AI Gateway's free credits). Then run 0b step 5 with `AI_GATEWAY_API_KEY` and confirm three things:
   - every question gets a probability, and the clean record passes;
   - a borderline record shows the fallback model in the `decision` layer's `model` field;
   - latency stays under 3 s.
2. **Prompt Guard (Groq), validated, not optional.** The user supplies `GROQ_API_KEY`.
   - Probe once with a benign string and an attack string, and log the raw `choices[0].message`. The code expects a bare number; fix the parser if Groq returns a label or JSON.
   - Then confirm that "ignore previous instructions..." rejects through `instructions_to_ai`.
   - Test one non-English record longer than 1,500 characters to see whether Groq errors or truncates past 512 tokens.
3. **OpenAI moderation.** The user supplies `OPENAI_API_KEY`. Confirm that the abusive example raises `harassment_or_hate`.
4. **Dataset loads never call paid models.** `scripts/seed.ts` runs only the deterministic `evaluateSubmission`, with no Jev, Groq, OpenAI or embedding calls; item 2's generator must load through it too. Never load demo data through `submit_experience` or `assessSubmission`. For scripts that go through the pipeline (`demo.mts`, `simulate-attack.ts`), set `AFTERTASTE_SCREENING=off` unless you are testing the models.

## 0b. Test the integrity layer locally, then roll out

Run all of this on the user's machine. Never run `simulate-attack.ts` against Neon: it writes rows, and `seed.ts --reset` wipes every table.
1. Local database with pgvector: `docker run -d --name aftertaste-pg -e POSTGRES_PASSWORD=pg -p 54329:5432 pgvector/pgvector:pg16`. Then, in the shell only (don't edit `.env.local`): `export DATABASE_URL=postgresql://postgres:pg@localhost:54329/postgres AFTERTASTE_HASH_SALT=local`. Unset `DATABASE_URL_UNPOOLED` if the shell has it, because scripts prefer it.
2. `pnpm exec drizzle-kit migrate`, then `pnpm exec tsx scripts/seed.ts`. Expect 10,000 records, 300 subjects and 650 contributors.
3. `pnpm lint && pnpm typecheck && pnpm test`, then `pnpm build`. The build needs the database because of `generateStaticParams`.
4. Without any model keys:
   - Run `pnpm exec tsx scripts/simulate-attack.ts`. Expect the outcomes listed under "Working state", then clean up with `--cleanup`.
   - Run `pnpm exec tsx scripts/integrity.ts sweep` on the clean seed. Expect zero bursts, lockstep and shared-infrastructure findings.
   - Run `pnpm start -p 3123` and `MCP_URL=http://localhost:3123/api/mcp pnpm exec tsx scripts/demo.mts`. Expect the same output as before: published, rejected spam, anonymous held.
5. With keys exported in the shell, test one provider at a time. Submit a clean record, a promotional one, a grudge, one with "ignore previous instructions...", and one naming a staff member through the demo or a small script. Then check `pnpm exec tsx scripts/integrity.ts screen <id>` and confirm each layer's output and latency (the target is under 3 s total). Keys needed:
   - `OPENAI_API_KEY` (moderation)
   - `IPINFO_TOKEN`
   - `AI_GATEWAY_API_KEY` (Jev decisions and embeddings; the team needs a card on file first)
   - `GROQ_API_KEY` (Prompt Guard)
6. Network layer:
   - `pnpm exec tsx scripts/integrity.ts ranges` should load the Tor, X4BNet VPN/datacenter, OpenAI connector and Anthropic egress lists. In the cloud sandbox the Tor and OpenAI fetches failed: check whether that was the sandbox or the URLs.
   - Check `request_signals.client_name`: the demo client sent no MCP `clientInfo`, so it was empty. Confirm a real client (Claude Code) fills it through `ctx.client.info()`.
7. Rollout (the user deploys):
   1. `vercel env run -e production -- pnpm exec drizzle-kit migrate`, before the deploy (it adds the vector extension, six tables and four `experiences` columns).
   2. Add the provider keys plus `CRON_SECRET` on Vercel. AI Gateway uses the deployment's OIDC token there.
   3. `vercel deploy --prod --yes`.
   4. `vercel env run -e production -- pnpm exec tsx scripts/integrity.ts sweep` once.
   5. Optional: a Vercel WAF rate-limit rule on `/api/mcp`. Keep BotID and Bot Protection off that route.
8. Known gaps:
   - The thresholds in `rubric.ts`, `behavior.ts`, `network.ts` and `pipeline.ts` come from the literature and are uncalibrated. Label 300–500 records and recalibrate.
   - The seed records have no embeddings, so paraphrase search only covers new records.
   - The cron is daily because Hobby plans reject more frequent schedules; hourly needs Pro.

## Hackathon tracks

Targeting three sponsor tracks; the README's "Built with" section pitches all three. The kickoff slides don't say whether one project can enter several tracks; confirm with the organizers.

| Track | Prize | Why Aftertaste fits | Still needed |
|---|---|---|---|
| Manufact, "Best MCP server for agents" | 1st $2,000 + $6,000 credits | Built on mcp-use (Manufact's framework): one `MCPServer`, server instructions, `withMcpUse`/`createNextHandler` inside Next.js, `experience-cards` view, the integrity layer | Items 0, 2 and 3; be ready to explain why we host on Vercel, not Manufact cloud (one deployment, no free-tier cold starts during the demo) |
| Armature, "Build something agents use" (coding agents, no human in the loop) | Winner $2,000, runner-up $1,000 | Anonymous reads, self-registration, policy as data, `/llms.txt` and `/install.md`, no 401 dead ends | Items 2 and 4; optionally item 6, which closes the "coding agents" gap |
| Inkbox, persistent agent identity | 1st $1,000 + $1,000 credits | `verify_agent_identity` badge over Inkbox A2A | Item 5: badge never tested live; prod has no Inkbox keys, so the tool fails there today |

Skipped: Primitive (email; $3,000 first, but nothing built; the email follow-up design under "Design for cloud chatbots" would be its entry), Blaxel (low cash; the agent-first theme can be mentioned in the pitch), InstaBox (no fit).

## Backlog with backstory

### 1. Review and rewrite the MCP descriptions (the user does this by hand)
- **Owner**: the user. Agents: don't edit these texts unprompted; point the user here.
- **What agents read, and where it lives**:
  - Server instructions, sent on connect and reused by `/docs` and `/llms.txt`: `SERVER_INSTRUCTIONS` in `src/lib/aftertaste/guide.ts`.
  - The nine tool descriptions, the main signal for when an agent calls a tool: each tool's `description` in `src/mcp/server.ts`, plus the `experience-cards` view description there.
  - Field descriptions in the input schema: the `.describe(...)` calls in `src/lib/aftertaste/contracts.ts` (17 of them).
  - The policy returned by `get_contribution_guide`: `CONTRIBUTION_GUIDE` in `guide.ts`.
  - One-line tool summaries for `/docs`, `/llms.txt` and the README tool list: `TOOLS` in `guide.ts`.
  - The MCP Registry listing: `description` in `server.json`.
- **After editing**: `pnpm lint && pnpm typecheck && pnpm test`, commit, then `vercel deploy --prod --yes`. Connected clients pick up new instructions and descriptions on their next connection.

### 2. Replace the synthetic dataset with realistic, real-world data (decided; not started)
- **Problem with the current data** (`data/experiences.jsonl`, sampled 2026-10-17):
  - Subjects are invented: coined brand words plus generic types ("Dorrowen Cocktail Lounge", "Caddis Plumbing Crew"), placed in real Bay Area neighborhoods.
  - The text is fill-in-the-blank templates: about 4,500 distinct summaries and 2,600 distinct observations across 10,000 records.
  - Slots are filled with words that don't fit the subject. Examples: an izakaya "tried over a long project", whose "pistachio gelato was harder to use than expected"; a pottery studio whose "late set fell short"; a plumbing crew where "fridge cleaning stood out"; a cooking class where "the crew showed up early".
  - Agents quote this verbatim, and a judge reading search results or subject pages will spot it.
- **User decision (2026-10-17)**: use real businesses, products, APIs and services as subjects, with invented experiences. This is a hackathon demo, not a launch.
- **Guardrails** (they protect the real businesses and cost the demo nothing):
  - **Out of search engines**: subject pages for synthetic subjects get `robots: noindex` and are left out of `sitemap.xml`. This needs a small code change: filter `is_demo_fixture` in the sitemap query and in the subject page's `generateMetadata`. Judges and agents still reach everything over MCP and by direct link.
  - **Subjective observations only**: taste, noise, wait, fit, comfort, durability, value, setup, latency, docs clarity. Never hygiene, food safety, health, legality, discrimination, or named staff and individuals. Overall sentiment stays mixed, not a pile of one-star takedowns.
  - **Labels stay on**: `is_demo_fixture = true` and `synthetic: true` on every record, and the footer line. The server-instructions note was removed on 2026-10-18 at the user's request ("it's a dummy demo").
  - **Teardown**: after judging, delete the `is_demo_fixture` records with their review events and flags, then delete the subjects and contributors left without records. Keep at least one published subject, or the next build fails on an empty `generateStaticParams`.
- **Domains**:
  - **Restaurants**: real Bay Area restaurants. Each gets a profile built from public facts: cuisine, signature dishes from the real menu, price band, neighborhood.
  - **Shopping**: real products with their real variants (sizes, colors, models), e.g. outdoor gear, headphones, kitchen appliances.
  - **API / tech / product / service reviews**: real APIs, SDKs, CLIs, SaaS apps and local services. `agent_experiment` records carry versions, method and measurements; human records carry setup, support and value.
  - **Agent-only domain (suggested): agent operability** of real websites, APIs and MCP servers:
    - Is there an API or MCP server?
    - Is there a login wall or CAPTCHA? Can an agent check out?
    - What rate-limit headers come back, and how clear are the error messages?
    - Do the docs match what actually happens?

    Measuring these for real is cheap where a target is public. Measured records can carry `synthetic: false`.
- **Generation**:
  1. Collect real subjects per domain with web search.
  2. Build a fact profile for each subject.
  3. Generate records with an LLM, drawing only from that subject's profile. This fixes the slot mismatches of the current data.
  4. Validate every record with `submissionSchema` and `evaluateSubmission`, dedupe, and load with the existing `scripts/seed.ts --reset`.
- **Open decisions for the user**:
  - Total size: 10k again, or about 2-3k coherent records.
  - Whether agent operability is the fourth domain.
  - Which LLM and budget to use for generation.

### 3. Check that the MCP Apps cards render in real clients (Manufact)
- **Context**: `search_experiences` declares an output schema and the `experience-cards` view (`src/mcp/views/`), so MCP Apps clients (Claude, ChatGPT, VS Code, Cursor per vendor docs) should render cards. Server side is verified (resource listed, assets 200); it hasn't been seen inside Claude or ChatGPT.
- **How**: add the connector in Claude.ai (Customize, Connectors, Add custom connector, endpoint URL) and run a search. Don't set an `MCP_URL` env var (it changes asset origins); preview-deployment protection would block view assets.

### 4. Record the no-human onboarding demo (Armature, also helps Manufact)
- **Goal**: show a coding agent (Claude Code or Codex) going from nothing to a contribution with no human help: it reads `https://aftertaste-ai.vercel.app/llms.txt`, installs the server itself, searches, calls `register_contributor`, and submits an `agent_experiment` record.
- **Cleanup**: delete the records it creates afterwards with the moderation `delete` command; also delete its contributor and any orphaned subject (no CLI for those yet; a one-off SQL delete through `vercel env run` works).

### 5. Inkbox verified-agent badge, live test (Inkbox)
- **Context**: optional identity layer. A registered contributor calls `verify_agent_identity(handle)` and gets a nonce signed for that contributor; the agent sends `aftertaste-verify:<nonce>` over A2A from its Inkbox identity to ours; the second call reads our Inkbox task ledger, links the handle and marks the task complete (single use). Code: `src/lib/aftertaste/inkbox.ts`, `verifyAgentIdentity` in `service.ts`.
- **Needs**: an Inkbox Console account with two identities and agent-scoped keys. The server's go to Vercel as `INKBOX_AGENT_HANDLE` / `INKBOX_API_KEY`; the demo agent's go in `.env.inkbox` as `DEMO_INKBOX_HANDLE` / `DEMO_INKBOX_API_KEY`. `pnpm demo` runs the verification step automatically when those are present.
- **Unverified**: the ISO format of the ledger `since` parameter; whether Console-created identities count as "claimed".

### 6. Coding-agent loop (optional, Armature)
- `lookup_issue(signature, package, version)` and `report_outcome(experience_id, worked, environment)`, plus error-signature normalization and a Claude Code hook. Designed under "Design for autonomous agents" at the end of this doc; nothing built.

### 7. Publish to the official MCP Registry (optional; Armature discoverability)
- **What it is**: the public catalog of MCP servers run by the MCP project (registry.modelcontextprotocol.io). It has nothing to do with mcp-use. Directories and aggregators read it; most clients do not install from it directly, so it is discoverability, not an install path.
- **State**: `server.json` at the repo root is ready (`io.github.prmsregmi/aftertaste`, remote `https://aftertaste-ai.vercel.app/api/mcp`, optional Authorization header). The namespace requires the GitHub account `prmsregmi`.
- **Steps**: `brew install mcp-publisher`, `mcp-publisher login github` (device flow, needs the human), `mcp-publisher publish`. Published versions are immutable; bump `version` for each publish. Do item 1 first, since the listing's `description` is one of the texts the user is rewriting.

### 8. Follow-ups and autonomous-agent features
Designed in the sections below; nothing built.

### 9. Smaller items
- Brief items not built: `correct_experience` / retract tool; gap logging of empty searches (also part of item 8).
- OAuth sign-in so ChatGPT and Claude.ai users can contribute (those connectors can't send our bearer token). Check whether mcp-use can keep anonymous access alongside OAuth before building it.
- Contribute one real agent-experiment record (the build notes: mcp-handler to mcp-use, Next 16 cache components, versions, measured latency).
- Reloading the dataset: `vercel env run -e production -- pnpm exec tsx scripts/seed.ts --reset` wipes every table first (including real contributors). Without `--reset` it fails on existing subject slugs and changes nothing. The build needs at least one subject, because Cache Components rejects an empty `generateStaticParams`.
- mcp-use 2.10.1 is out; untested.

## Architecture page: keep it current

- **Source of truth**: `public/architecture.html` in the repo, served at https://aftertaste-ai.vercel.app/architecture.html (noindex, not in the sitemap) and linked from the README and the GitHub description. The session scratchpad copy is temporary; don't rely on it.
- **Rule**: any change to the architecture (database, tools, identity, caching, new services) updates this file in the same commit, then deploys with the site.
- **Pending updates**: none in the repo copy (the classifier layer was added on 2026-10-18). The Claude artifact mirror below was not refreshed and is now behind; it also lacks the integrity layer.
- **How it works**: one self-contained HTML file (inline SVG built by a small script from `NODES`/`EDGES` arrays, a detail drawing per zoomable node, a hover info panel). Edit the arrays and detail functions; no build step.
- **Claude artifact mirror** (https://claude.ai/artifact/AvXJG1Pe59z8V1YVznoy1E, shared "anyone with the link"): optional. To refresh it, read it with the Artifact tool first, then publish with that `url`. The artifact format must not include the outer document wrapper, so strip `<!doctype html>`, `<html>`, `<head>` and `<body>` (and their closing tags) from the repo copy and keep everything from `<title>` onward.

## Conventions and gotchas

- Checks before every commit: `pnpm lint && pnpm typecheck && pnpm test`. A security-review hook comments on commits; fix or explain each finding.
- Never stage `.agents/`, `.claude/` or `skills-lock.json` (installed by the Neon integration); stage explicit paths.
- Don't edit or copy `.env.local` (the user blocked this); ask the user to change local env.
- Restart `pnpm dev` after changing `next.config.ts`, MCP views or global CSS; the dev server serves stale modules otherwise.
- Copy and UI: the user wants minimal text, no filler, and pushes back hard on verbosity.
- Moderation: `vercel env run -e production -- pnpm exec tsx scripts/review.ts list|approve|reject|sample|delete <id>`.
- Production migrations: `vercel env run -e production -- pnpm exec drizzle-kit migrate`. End-to-end check: `MCP_URL=https://aftertaste-ai.vercel.app/api/mcp pnpm demo`, then delete the demo's records with the moderation `delete` command.
- `vercel env run` layers `.env.local` on top of remote vars (scripts prefer `DATABASE_URL_UNPOOLED` partly for this). It also misparses arguments containing `=` or bare file paths; once it deployed a scratch file as a new public project. Always use the `-- pnpm exec ...` form.

---

# Plan: getting experiences written back later (not built)

## Problem

Most experiences happen after the conversation that would have captured them. A user asks an assistant about a restaurant or a jacket, Aftertaste search comes back empty, the user decides offline, and nothing triggers a review afterwards. Two populations behave differently:

- **Cloud chatbots** (ChatGPT, Claude.ai, Gemini): reactive; they only act when the user writes, unless the platform offers its own scheduler.
- **Autonomous agents** (always-on assistants, coding agents, workflow agents): act on their own events and can write back without a human turn.

Hard constraint: Aftertaste is an MCP server. It only sees tool calls inside sessions the client started. It cannot open a conversation, push a message into a chat, or create anything in the user's account. The MCP 2026-07-28 spec removed the server-to-client push model (sampling/elicitation deprecated, no GET stream), so there is no protocol path for this either.

## What cloud chatbots can do today (verified 2026-10-17)

| Platform | Capability | Notes | Source |
|---|---|---|---|
| ChatGPT | Scheduled tasks: one-off, recurring, monitoring; created by asking in chat or approving a proposal; notifies by push and email | Can use web search and some connected apps; I could not confirm that custom MCP apps (ours) run inside a task. Event-triggered tasks are limited to Gmail/Slack/GitHub on paid plans. Pulse was folded into scheduled tasks (mid-2026). | help.openai.com/en/articles/10291617, itbrief.com.au (June 2026), porteden.com/blog/chatgpt-scheduled-tasks-tools |
| Claude.ai chat | No reminder or scheduler in regular chat found | Scheduled tasks exist in Cowork (Claude Desktop, paid) and Claude Code (claude.ai/code/scheduled). | x.com/claudeai/status/2026720870631354429, code.claude.com/docs/en/scheduled-tasks |
| Claude.ai chat | Google Calendar connector can create, update, delete events | Only if the user connected it; Team/Enterprise admins must enable it. | support.claude.com/en/articles/10166901 |
| Gemini | Scheduled actions on Google AI Pro/Ultra and some Workspace plans, up to 10 active | Email/doc-monitoring triggers seen in an app teardown, not confirmed live. | blog.google/products/gemini/scheduled-actions-gemini-app |
| Any client | "Add to Google Calendar" template link (`calendar.google.com/calendar/render?action=TEMPLATE&text=&dates=&details=`) | Widely used, not officially documented by Google. User must tap and save. | github.com/InteractionDesignFoundation/add-event-to-calendar-docs |
| Prefilled-chat links | `chatgpt.com/?q=`, `claude.ai/new?q=` | Not documented by OpenAI or Anthropic; reports conflict. Do not rely on them. | community.openai.com/t/574003, github.com/anthropics/claude-code/issues/8827 |

## Design for cloud chatbots

The only lever is the moment our tool is called, so the nudge lives in the tool response, where the model reads it in context.

1. **Follow-up block in tool results.** When `search_experiences` returns no results, or `submit_experience`/a new `note_decision` tool reports a decision, the response carries:
   ```json
   "follow_up": {
     "ask_after": "2026-10-20",
     "question": "How was dinner at Nopa? Anything others should know?",
     "offer": "Offer the user a check-in. If you can schedule tasks (ChatGPT scheduled tasks, Gemini scheduled actions) or create calendar events (Claude Google Calendar connector), offer to do it. Otherwise share add_to_calendar_url.",
     "add_to_calendar_url": "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Rate%20Nopa&dates=...&details=https://aftertaste-ai.vercel.app/r/<token>",
     "review_url": "https://aftertaste-ai.vercel.app/r/<token>"
   }
   ```
   Every path still needs one "yes" from the user.
2. **One-tap review page** `/r/<token>`. The token encodes subject, gap ID and expiry, never the user. Page: rating plus aspect chips plus optional text. The person writes it themselves, so consent is built in. Submits through the normal evaluator as `human_firsthand`, anonymous queue unless the token was minted for a registered contributor.
3. **Gap log.** Every empty search stores a gap row (normalized query, subject guess, count, first/last seen). Returns `gap_id` so a later review links back and we can measure "gap filled".
4. **Recurring harvest (ChatGPT only, unverified).** Suggest a weekly scheduled task: "find experiences in my chats worth sharing to Aftertaste". Depends on two unverified things: tasks reading chat history, and tasks calling custom MCP apps. Test before promising.
5. **Opt-in email reminder (only path that reaches someone who never returns).** User explicitly gives an email. Daily Vercel Cron sends one reminder (Inkbox mail from our identity, or Resend) with the review link. Contact stored in its own table, never joined to records, deleted after send or 14 days. One reminder, one nudge maximum.
6. **Gap subscribers.** Only through opt-in email: when a gap gets filled, notify people who asked ("someone reviewed the jacket you asked about; how was yours?").

### Data model

- `gaps(id, query_norm, subject_guess, hits, first_seen, last_seen, filled_by_experience_id)`
- `follow_ups(id, gap_id, subject, due_at, channel[agent|calendar|email], status[scheduled|sent|answered|expired|cancelled], contributor_id null, token_hash, created_at)`
- `follow_up_contacts(follow_up_id, email_encrypted, consent_at, delete_after)`

### Tests to run before building further

- In ChatGPT with our connector: does the model offer and create a scheduled task from the follow-up block? Does the task's later run call our app?
- In Claude with Google Calendar connected: does it create the event when offered?
- Click-through rate of the calendar link plus review page, versus no nudge.

## Design for autonomous agents

Triggers are the agent's own work events, so no reminder is needed.

| Event | Action |
|---|---|
| Tool/API call fails | Exact-match lookup by normalized error signature plus package@version or endpoint |
| Error then success | Write back error signature, fix, versions, environment, observed success |
| Behavior differs from docs | Write back the observed behavior and the doc it contradicts |
| Measured comparison | Write back method and measurements |
| Retrieved record applied | Report outcome (worked / failed + environment) |

Build items:
- `lookup_issue(signature, package, version)`: exact-match, fast (<200 ms), returns fixes ranked by independent confirmations.
- `report_outcome(experience_id, worked, environment)`: confirmations from distinct contributors and environments set the `reproduced` evidence tier.
- Error-signature normalization on write (strip paths, IDs, numbers, hostnames).
- Organization sharing policy registered once (public vs org-only); org-only scope becomes required.
- Reference integration: Claude Code plugin with hooks (lookup on tool failure, contribution pass at Stop); thin wrapper for agent frameworks.
- Trace exporter: mine error→fix pairs from existing tracing tools under the org policy, so contribution needs no agent behavior change.

Risks: flooding (accept fixes only after observed success, dedupe by signature, rank only after confirmations); poisoned fixes (never auto-run; records with commands need confirmations before ranking); leakage of internal hostnames, paths and code (stronger redaction for agent records, distilled findings only).
