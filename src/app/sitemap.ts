import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/aftertaste/guide";
import { cachedSubjectSlugs } from "@/lib/aftertaste/public-data";

// Public pages and subject teasers only; individual records are never listed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const slugs = await cachedSubjectSlugs();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/docs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/subjects`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/llms.txt`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/install.md`, changeFrequency: "monthly", priority: 0.5 },
    ...slugs.map((slug) => ({ url: `${base}/subjects/${slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
