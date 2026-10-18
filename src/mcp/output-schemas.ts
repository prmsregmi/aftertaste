import { z } from "zod";

// Loose objects: clients validate structuredContent against this schema, and records carry more fields than the view reads.
const searchResult = z.looseObject({
  id: z.string(),
  subject: z.looseObject({ name: z.string(), slug: z.string() }),
  variant: z.string().nullable(),
  summary: z.string(),
  source_type: z.string(),
  evidence_tier: z.string(),
  observed_on: z.string().nullable(),
  preferences: z.record(z.string(), z.string()),
  contributor: z.looseObject({ label: z.string().nullable(), verified_agent: z.string().nullable() }),
  caveat: z.string(),
});

export const searchOutputSchema = z.looseObject({
  query: z.string(),
  results: z.array(searchResult),
  coverage_note: z.string(),
  disambiguation: z.string().optional(),
});

export type SearchResult = z.infer<typeof searchResult>;
