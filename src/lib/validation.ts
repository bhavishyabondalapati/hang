import { z } from "zod";
import { MEDIUM_GROUPS, SOURCES, THEMES, idSchema } from "./artwork";
import { DYNASTY_SLUGS } from "./dynasty";
import { THEME_SLUGS } from "./themes";

const text = (max: number) => z.string().trim().max(max);

export const wallTitle = text(80).min(1, "Give the wall a title");

export const createWallInput = z.object({
  title: wallTitle,
  description: text(500).default(""),
  isPublic: z.boolean().default(false),
  theme: z.enum(THEMES).default("plaster"),
});

export const updateWallInput = z
  .object({
    wallId: z.string().uuid(),
    title: wallTitle.optional(),
    description: text(500).optional(),
    isPublic: z.boolean().optional(),
    theme: z.enum(THEMES).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, "Nothing to update");

export const wallIdInput = z.object({ wallId: z.string().uuid() });
export const wallItemInput = z.object({ wallId: z.string().uuid(), artworkId: idSchema });
export const reorderInput = z.object({
  wallId: z.string().uuid(),
  orderedArtworkIds: z.array(idSchema).min(1).max(200),
});
export const likeInput = z.object({ artworkId: idSchema });

const csv = <T extends z.ZodType>(item: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(item).max(10) as unknown as z.ZodType<z.output<T>[], string[]>)
    .optional();

/** Query-string schema shared by /search and /api/search so URLs are shareable. */
export const searchInput = z.object({
  q: text(120).optional(),
  museum: csv(z.enum(SOURCES)),
  dynasty: csv(z.enum(DYNASTY_SLUGS)),
  theme: csv(z.enum(THEME_SLUGS)),
  medium: csv(z.enum(MEDIUM_GROUPS)),
  hue: z.coerce.number().int().min(0).max(359).optional(),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
});
export type SearchInput = z.infer<typeof searchInput>;

export const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

export function firstOf(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
