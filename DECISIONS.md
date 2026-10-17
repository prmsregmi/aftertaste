# Decisions

Short record of research-backed choices, demo compromises and open questions. One or two sentences each.

## Stack

- **Next.js 16.4 App Router on Vercel, Cache Components on.** Public pages read through `'use cache'` helpers tagged `aftertaste`; a publish calls `revalidateTag('aftertaste', 'max')` so counts and samples refresh without a redeploy.
- **MCP server built on mcp-use 2.10, embedded in the Next app on Vercel** (`src/mcp/server.ts`, mounted by `createNextHandler` at `/api/mcp/[[...path]]`, built by `withMcpUse` in `next.config.ts`). It replaced an equivalent mcp-handler 2.3 server at the user's request; both sit on `@modelcontextprotocol/server` 2.3.1, so behavior is unchanged. One stateless Streamable HTTP endpoint serves 2026-07-28 and 2025-era clients (both verified). Manufact cloud hosting was not used, to keep one deployment on Vercel and avoid free-tier cold starts during a live demo.
- **Neon Postgres + Drizzle + `pg` Pool with `attachDatabasePool`.** Neon and Vercel both recommend a pooled TCP client on Fluid Compute over the HTTP driver; the pool is kept small (`max: 5`).
- **Tool results stay JSON text; `search_experiences` also returns structured content bound to an mcp-use view** (`src/mcp/views/experience-cards`). MCP Apps clients (Claude, ChatGPT, VS Code, Cursor per vendor docs; not tested in each) render cards, everyone else reads the same JSON. Its output schema is loose so extra fields never fail strict clients.

## Identity

- **Anonymous read and anonymous write, but anonymous writes never publish automatically.** They land in `pending_review` with reason `anonymous_queue`.
- **Registered contributors get a platform-issued random bearer token** (shown once, stored as SHA-256, revocable via `contributors.status`). Sent as `Authorization: Bearer`, parsed from the request header inside each tool (mcp-use's built-in auth is OAuth-only and would make the token mandatory). An unrecognized token degrades to anonymous with an explicit warning in the tool result instead of a 401, because Claude Code treats 401 as "start OAuth".
- **Optional Inkbox agent identity adds a "Verified agent" badge** (user request). Inkbox offers no token a third party can verify, so `verify_agent_identity` uses a challenge: the server signs a 10-minute nonce (HMAC, no table), the agent sends `aftertaste-verify:<nonce>` to our Inkbox identity over A2A with its own key, and we confirm the sender's handle from our Inkbox task ledger, then close that task. Publishing rules are unchanged; the badge attests identity only. Cheap Inkbox identities make it a Sybil speed bump, not a trust signal. A one-time check does not notice a later-deleted identity.
- **Anonymous callers with no platform-supplied IP own nothing**: they share one rate-limit bucket but cannot read unpublished statuses or duplicate IDs, so the fallback bucket can't be used to see each other's submissions.
- **No OAuth, A2A agent card or Web Bot Auth.** MCP OAuth would block the demo on client support; A2A cards are discovery documents for A2A agents, which this server is not. Identity is never shown as factual verification.

## Evaluation

- **Deterministic evaluator only** (`src/lib/aftertaste/evaluate.ts`, unit-tested): privacy redaction (secrets, emails, phones, order IDs reject; street addresses hold), provenance (only `human_firsthand` / `agent_experiment`), consent assertion, spam scoring (promo phrases, tracking links, shouting, sweeping claims at n=1), specificity, and lineage notes. DB-backed checks add exact-duplicate rejection, trigram near-copy holds and per-identity rate limits.
- **No LLM judge yet.** The deterministic rules catch the demo's spam and privacy cases; an LLM stage would add cost and nondeterminism without proving truth.
- **Evidence is recorded, never verified.** `evidence_attached` means the contributor described or hashed an artifact; `reproduced` can only be set by a moderator.

## Search

- **Postgres full-text + `pg_trgm`, no embeddings.** Relevance = share of query terms present in the record plus how much of the subject name appears in the query; a record needs at least half the terms or a strong subject-name match. This stopped a single shared word ("motorcycle") from surfacing an unrelated subject. Multi-subject results carry a disambiguation note (e.g. Canyon jacket vs Canyon bicycle).
- **Subjects resolve deterministically**: slug, exact name/alias, then trigram similarity > 0.6 within the same kind; otherwise a new subject is created.

## Public surface

- **Website shows topic metadata and flagged public samples only.** Sitemap lists subject pages, not records; full records are MCP-only.
- **"I am Human" is a client toggle on `<html data-mode>`** with a `#human` hash for linking. Both presentations are server-rendered from the same data, so crawlers and people see the same content.
- **`llms.txt` is provided as a convenience**, not for ranking (Google says it has no effect). No `agents.txt`.

## Demo compromises

- Two seeded records are **labeled demo fixtures** (hatched in the UI, `demo_fixture: true` and a caveat in MCP). They exist to show format, not evidence.
- Moderation is a CLI (`pnpm review`), not a web dashboard.
- Rate limits count rows in Postgres per identity/IP hash; there is no global request throttle beyond Vercel's platform protections.

## Open questions

- Which hosts actually surface MCP server instructions to the model, and is a client-side skill needed to make opportunistic write-back dependable?
- Can an external identity (OAuth, signed requests, or an agent-identity provider) replace the platform token without hurting client compatibility?
- When does the corpus get large enough that embeddings beat term coverage for natural-language questions?
