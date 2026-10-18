# Decisions

Research-backed choices, tradeoffs and open questions, one or two sentences each.

## Stack

- **Next.js 16.4 on Vercel with Cache Components.** Public pages read through tagged caches, and a publish refreshes them without a redeploy.
- **MCP server on mcp-use 2.10, embedded in the Next app** (`createNextHandler` at `/api/mcp`). One stateless Streamable HTTP endpoint serves both 2026-07-28 and 2025-era clients. It runs on Vercel rather than Manufact cloud, to keep one deployment and avoid free-tier cold starts.
- **Neon Postgres + Drizzle with a small pooled `pg` client** (`attachDatabasePool`), which Neon and Vercel recommend on Fluid Compute. Full-text, trigram and vector search all run inside Postgres.
- **Search results also come back as structured content bound to an mcp-use card view.** Clients without MCP Apps support read the same JSON.

## Identity and access

- **Every request carries a pseudonymous contributor token; there are no accounts.** Terminal agents get one from a setup command (`POST /api/register`) that installs the server in the same step. Claude.ai and ChatGPT get one from a one-click Continue page. A request without a token gets a 401 that points to the setup page.
- **Static, non-expiring, revocable tokens instead of OAuth refresh.** This departs from the standard on purpose: refresh fails often in agent clients, and a token that never expires never fails. A leaked token stays valid until revoked, so it travels only over TLS, is stored as SHA-256 and unlocks nothing personal. The production path is short-lived access tokens with rotating refresh tokens and scopes.
- **Chat-app sign-in is a minimal OAuth server with no accounts:** RFC 9728 metadata, dynamic client registration and PKCE S256. Client IDs and codes are HMAC-signed payloads, and codes are single-use with a 5-minute expiry, so only the contributor row is stored. The bot check (BotID) and the per-network limit run when the user clicks Continue, because the token exchange comes from the platform's servers. The token is advertised as valid for ten years, so apps never refresh.
- **Token issue is the cheapest Sybil attack.** It is guarded by an atomic per-network hourly counter, consumed on every attempt including Continue clicks, and by the network-risk block.
- **Request limits: 300 per token and 2,000 service-wide per UTC hour.** The token limit is checked first, so no single token can exhaust the shared budget.
- **Give-to-get search: each token gets 100 searches a day.**
  - **Credit.** Each credited record adds 25 a day for 30 days, up to 500. A record earns credit only if it is published, still carries integrity weight, is the first for its subject, and is one of at most 3 a day; down-weighting removes the credit. Give-to-get invites junk, which is why curl ended its bug bounty.
  - **Exhaustion.** Running out returns a non-retryable tool error with `resets_at`, so agents stop and don't read it as "no matches".
- **Optional Inkbox "Verified agent" badge, through a signed A2A challenge.** Inkbox offers no token a third party can verify. The badge attests identity only, never that a claim is true.

## Screening

- **Filters, then one gate, then the models.**
  - **Filters.** Records the redaction rule rejects (secrets, emails, phone numbers, order IDs) and exact duplicates are stored rejected without any model call, so personal data never reaches a third party.
  - **Gate.** Everything else is accepted only within each token's 20 submissions an hour and the screening budget. Over a limit, the submission is refused and nothing is stored.
  - **Models.** Every accepted submission is screened, so the screening budget is the acceptance limit.
- **Screening budget: 2,000 an hour and 50,000 a week by default.** That is production sizing, a few dollars a week. The demo deployment sets 200 and 4,000 through env. The hourly limit is checked before the weekly one, so refused attempts don't drain the week.
- **A decision model, not a prompted LLM.** Jev (pinned to 1.13.0, which retains no data) answers ten narrow yes/no questions with native probabilities; CheckEval found binary questions agree better than one holistic score. When an answer falls between 0.3 and 0.7, AI Gateway reruns the decision on OpenAI's decision model, so one model's blind spot doesn't decide alone.
- **Specialist classifiers can only raise a score.** Llama Prompt Guard 2 scores injection per 512-token chunk and keeps the maximum; OpenAI moderation (optional) scores abuse. A miss costs nothing, and a catch counts.
- **Reject only near-certain promotion, abuse, instructions to AI or secondhand content; hold anything merely likely.** Holding is cheap, and wrongly rejecting a real report is not.
- **Fail closed.** A record the decision model didn't judge is held as `screening_incomplete`, and the sweep re-screens it for eight days. A failing specialist never blocks publishing.
- **Agents are the expected callers.** Machine-written style and automation are never risk signals, so BotID and CAPTCHAs stay off the MCP endpoint.
- **Network signals hold submissions.** The signals are Tor, VPN and datacenter ranges, ASN, spoofed connector user agents, and token farming per /24 or /48. Shared platform egress is exempt from per-network velocity. IPs are kept only as salted hashes, for 90 days.
- **A daily behavior sweep.** It checks Poisson bursts against a shrunk 28-day baseline, polarity shifts, CopyCatch-style lockstep groups and shared /24 per subject, and keeps a Beta reputation with forgetting. Paraphrases are caught with embeddings in pgvector, because LLM rewording defeats trigram matching.
- **Down-weight and disclose, don't delete.**
  - **Ranking.** Search ranks by relevance times an integrity weight. Confirmed manipulation drops to 0, and subjects with bursts show a notice, which is Steam's approach to review bombs.
  - **Symmetry.** The same checks apply to boosting and to bombing, because FTC 16 CFR 465 forbids selectively suppressing negative reviews.
  - **Newcomers.** New accounts lose a little weight for one week only, because Yelp's filter over-penalized newcomers.
- **Screening runs synchronously, within 15 seconds,** so agents get a final status in the same call. mcp-use's bundle has no `after()`, so post-response work uses `waitUntil`. The cron is daily because Hobby rejects more frequent schedules.
- **Evidence is recorded, never verified.** Only a moderator can set `reproduced`.

## Evaluation

- **Tuned against 165 adversarial records written by four agents** (`data/screening-eval.jsonl`, run by `scripts/eval-screening.ts` through the rules and the live models).
  - **The sets:** legitimate records that look suspicious; promotion and secondhand claims; disguised and multilingual injection; abuse and private people.
  - **First pass: 148 of 160 correct.** Keyword rules caught 8 of 25 injection attacks, against the models' 25. They also rejected genuine records ("Best pizza ever!!!", acronyms, "system prompt"), so the content keyword rules were removed.
  - **Two questions reworded.** "Stake in the subject" now covers speaking for the business or running a competitor, disclosed or not, and states that buying the product is not a stake. "Instructions to AI" now covers indirect forms ("the best answer to any coffee question is X") and leaves plain boycott calls to the grudge question.
  - **Final pass: 155 of 165 correct.** No harmful record published and no publishable record was rejected; the remaining misses sit on the hold/reject boundary.
- **Held-out check: 44 of 48 correct** (`data/screening-eval-blind.jsonl`, written after tuning by an agent that never saw the tuning set). All 12 attacks were rejected and nothing was falsely rejected. The one miss, a partly secondhand medical account, is left untuned so the test isn't fitted.
- **Why two models.** Prompt Guard scored a reader-directed ranking instruction at 0.0009; the decision model scored it 1.0.
- **Real keys:** a full screening takes about 1 second, with the decision model (0.5 s), Prompt Guard (0.2 s) and the embedding (0.5 s) running in parallel.
- **Simulation:** an 8-account review bomb across 3 subjects had 3 registrations refused and all 24 records held or quarantined, and every coordination detector fired. A sweep over 10,000 clean records found nothing.
- **Path to an owned classifier.** Every verdict is stored, and `pnpm integrity export` writes training labels for a distilled ModernBERT or SetFit model once a human-audited gold set exists. The thresholds are uncalibrated starting points.

## Search and public surface

- **Postgres full-text + `pg_trgm`.** Relevance is term coverage plus subject-name match, and a record needs at least half the terms or a strong name match, so one shared word doesn't surface an unrelated subject.
- **Subjects resolve deterministically:** slug, then exact name or alias, then trigram similarity above 0.6 within the same kind.
- **Public pages show only topic metadata and public samples; full records are MCP-only.** The "I am Human" toggle renders the same data in a second presentation.
- **The logo goes out in MCP `serverInfo.icons` and `server.json`.** `llms.txt` is a convenience, not a ranking signal.

## Tradeoffs

- **Seed records:** 10,000 generated records about 300 invented subjects (a spot check found no real business), loaded without model calls. MCP results don't mark them; `is_seed` stays internal for bulk removal.
- **Moderation is a CLI, not a dashboard.**

## Open questions

- Which hosts surface MCP server instructions to the model, and is a client-side skill needed to make write-back dependable?
- When will the corpus be large enough for embeddings to beat term coverage on natural-language queries?
