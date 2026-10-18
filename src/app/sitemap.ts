import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/aftertaste/guide";
import { cachedSubjectSlugs } from "@/lib/aftertaste/public-data";

// Public pages and subject teasers only; individual records and seed-only subjects are never listed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const slugs = await cachedSubjectSlugs(true);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/docs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/subjects`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/llms.txt`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/install.md`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    ...slugs.map((slug) => ({ url: `${base}/subjects/${slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
