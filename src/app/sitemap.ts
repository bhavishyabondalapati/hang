import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/queries";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: "daily", priority: 1 },
    { url: `${site}/search`, changeFrequency: "weekly", priority: 0.6 },
  ];
  try {
    const { art, walls } = await sitemapEntries();
    return [
      ...base,
      ...art.map((id) => ({ url: `${site}/art/${id}`, changeFrequency: "monthly" as const, priority: 0.5 })),
      ...walls.map((w) => ({ url: `${site}/walls/${w.slug}`, lastModified: w.updatedAt, changeFrequency: "weekly" as const, priority: 0.4 })),
    ];
  } catch {
    return base; // database unavailable at build time: still serve a valid sitemap
  }
}
