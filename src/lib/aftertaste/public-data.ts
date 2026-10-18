import { cacheLife, cacheTag } from "next/cache";
import {
  CACHE_TAG,
  getPublicStats,
  getSubjectTeaser,
  listPublicSamples,
  listPublishedSubjectSlugs,
} from "./service";

// Cached reads for public pages; invalidated by revalidateTag(CACHE_TAG) when something publishes.

export async function cachedStats() {
  "use cache";
  cacheTag(CACHE_TAG);
  cacheLife("minutes");
  return getPublicStats();
}

export async function cachedSamples() {
  "use cache";
  cacheTag(CACHE_TAG);
  cacheLife("minutes");
  return listPublicSamples();
}

export async function cachedSubjectTeaser(slug: string) {
  "use cache";
  cacheTag(CACHE_TAG);
  cacheLife("minutes");
  return getSubjectTeaser(slug);
}

export async function cachedSubjectSlugs(excludeSeed = false) {
  "use cache";
  cacheTag(CACHE_TAG);
  cacheLife("hours");
  return listPublishedSubjectSlugs(excludeSeed);
}
