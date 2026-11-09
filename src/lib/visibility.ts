import { and, eq } from "drizzle-orm";
import { artworks } from "@/db/schema";

/**
 * THE visibility gate. A work is shown only if it is part of the Chinese collection AND not hidden by the
 * content filter. Every read path uses this one condition (search, Wander, detail, today's piece, colour rails,
 * walls and their previews, sitemap, OG images, likes), and add-to-wall / like refuse anything that fails it.
 */
export const isVisible = () => and(eq(artworks.collection, "china"), eq(artworks.hidden, false))!;
