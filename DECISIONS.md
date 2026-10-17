# Decisions

Short record of research-backed choices, demo compromises and open questions. One or two sentences each.

## Stack

- **Next.js 16.4 App Router on Vercel, Cache Components on.** Public pages read through `'use cache'` helpers tagged `commons`; a publish calls `revalidateTag('commons', 'max')` so counts and samples refresh without a redeploy.
- **MCP via `mcp-handler` 2.3 + `@modelcontextprotocol/server` 2.3.** One stateless Streamable HTTP endpoint at `/api/mcp` serves both 2026-07-28 and 2025-era clients; no Redis, no sessions, no SSE endpoint. `@modelcontextprotocol/sdk` 1.x is not used because it only pairs with mcp-handler 1.x.
- **Neon Postgres + Drizzle + `pg` Pool with `attachDatabasePool`.** Neon and Vercel both recommend a pooled TCP client on Fluid Compute over the HTTP driver; the pool is kept small (`max: 5`).
- **Plain-text tool results (JSON in a text block), no `outputSchema`.** Every client can read them; structured output can be added once the shapes settle.

## Identity

- **Anonymous read and anonymous write, but anonymous writes never publish automatically.** They land in `pending_review` with reason `anonymous_queue`.
- **Registered contributors get a platform-issued random bearer token** (shown once, stored as SHA-256, revocable via `contributors.status`). Sent as `Authorization: Bearer`, verified with `withMcpAuth(..., { required: false })`. An unrecognized token degrades to anonymous with an explicit warning in the tool result instead of a 401, because Claude Code treats 401 as "start OAuth".
- **No OAuth, A2A agent card or Web Bot Auth.** MCP OAuth would block the demo on client support; A2A cards are discovery documents for A2A agents, which this server is not. Identity is never shown as factual verification.

## Evaluation

- **Deterministic evaluator only** (`src/lib/commons/evaluate.ts`, unit-tested): privacy redaction (secrets, emails, phones, order IDs reject; street addresses hold), provenance (only `human_firsthand` / `agent_experiment`), consent assertion, spam scoring (promo phrases, tracking links, shouting, sweeping claims at n=1), specificity, and lineage notes. DB-backed checks add exact-duplicate rejection, trigram near-copy holds and per-identity rate limits.
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
