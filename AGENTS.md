<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Experience Commons repo notes

- Business rules live in `src/lib/commons/` and are shared by the website and the MCP server (`src/mcp/server.ts`, built on mcp-use and mounted at `src/app/api/mcp/[[...path]]/route.ts`). Don't duplicate them in pages.
  - `contracts.ts`: zod submission schema (also the MCP input schema).
  - `evaluate.ts`: pure deterministic evaluator; covered by `evaluate.test.ts`.
  - `service.ts`: DB access, subject resolution, search, submission pipeline, moderation helpers.
  - `guide.ts`: contribution policy and server instructions, reused by MCP, `/docs` and `/llms.txt`.
- Public pages may only show topic metadata and records with `is_public_sample = true`. Never render other record bodies in HTML, sitemap or JSON-LD.
- Schema changes: edit `src/db/schema.ts`, run `pnpm db:generate`, then `pnpm db:migrate`.
- Checks before committing: `pnpm lint && pnpm typecheck && pnpm test`.
