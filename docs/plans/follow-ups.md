# Aftertaste: handoff

Untracked working document (excluded via `.git/info/exclude`). It is the source of truth for the next agent; keep it current instead of relying on chat history.

## Where things stand (2026-10-17)

- **Product**: Aftertaste (renamed from Experience Commons). "Word of mouth, from agent to agent." An MCP server where agents search and write back firsthand experiences, plus a small website.
- **Live**: https://aftertaste-ai.vercel.app (old alias experience-commons.vercel.app still serves). MCP endpoint `/api/mcp`. Vercel project `aftertaste` on team `prestons-projects-ac5810a7`, CLI login `parinaadhi-3720`. Deploys are CLI only: `vercel deploy --prod --yes` (no Git integration).
- **Repo**: github.com/prmsregmi/aftertaste. The user wants commits straight on `main`, no AI attribution in commits. A teammate (ppastram) also pushes to `main`, so `git pull --rebase` before pushing.
- **Stack**: Next.js 16.4 App Router (Cache Components on), mcp-use 2.10 embedded via `withMcpUse` + `createNextHandler` (`src/mcp/server.ts`), Drizzle + `pg` Pool, Tailwind v4 + shadcn. Business rules in `src/lib/aftertaste/` (contracts, evaluate, service, guide, inkbox).
- **Database**: Neon (Vercel Marketplace store `experience-commons-db`), holding only the synthetic dataset: 10,000 published public records, 300 subjects, 650 pseudonymous contributors (loaded 2026-10-17 with `scripts/seed.ts --reset`). Its text is template-generated and often incoherent; replacing it with real-world subjects is item 2.
- **Env on Vercel**: Neon vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PG*`), `AFTERTASTE_HASH_SALT` (secret; salts IP hashes and Inkbox challenge signatures), `SITE_URL=https://aftertaste-ai.vercel.app` (pins canonical links).
- **Architecture page**: `/architecture.html` (noindex) and https://claude.ai/artifact/AvXJG1Pe59z8V1YVznoy1E (source in the session scratchpad; the public copy is `public/architecture.html`).
- **Design direction from the user**: very little visible text. Agent view is instinct.com-style (left-anchored serif, manifesto, connect commands). Human mode ("I am Human" toggle) is only caution tapes, a notebook with a "Copy AI instructions" button plus robot sticker, and a floating search.

## Working state at handoff

- `main` is clean, in sync with `origin/main` and equal to what's deployed (last commit "Rewrite the README around problem, insight and tools"; the README rewrite needed no deploy). Only the untracked `.agents/`, `.claude/`, `skills-lock.json` and this doc are outside git.
- Nothing is running in the background (dev server and watchers stopped).

## Hackathon tracks

Targeting three sponsor tracks; the README's "Built with" section pitches all three. The kickoff slides don't say whether one project can enter several tracks; confirm with the organizers.

| Track | Prize | Why Aftertaste fits | Still needed |
|---|---|---|---|
| Manufact, "Best MCP server for agents" | 1st $2,000 + $6,000 credits | Built on mcp-use (Manufact's framework): one `MCPServer`, server instructions, `withMcpUse`/`createNextHandler` inside Next.js, `experience-cards` view | Items 2 and 3; be ready to explain why we host on Vercel, not Manufact cloud (one deployment, no free-tier cold starts during the demo) |
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
  - **Labels stay on**: `is_demo_fixture = true` and `synthetic: true` on every record, and the server-instructions note and footer stay as they are.
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
- **Pending updates**: none in the repo copy (card view, `/install.md` and the synthetic dataset were added 2026-10-17). The Claude artifact mirror below was not refreshed and is now behind.
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
