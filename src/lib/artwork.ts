import { z } from "zod";
import type { Dynasty } from "./dynasty";
import type { ChinaTheme } from "./themes";

export const SOURCES = ["aic", "met", "cma"] as const;
export type Source = (typeof SOURCES)[number];

export const MUSEUMS: Record<Source, { name: string; short: string; url: string }> = {
  aic: { name: "Art Institute of Chicago", short: "Art Institute", url: "https://www.artic.edu" },
  met: { name: "The Metropolitan Museum of Art", short: "The Met", url: "https://www.metmuseum.org" },
  cma: { name: "Cleveland Museum of Art", short: "Cleveland", url: "https://www.clevelandart.org" },
};

export const MEDIUM_GROUPS = [
  "Painting",
  "Drawing",
  "Print",
  "Photograph",
  "Sculpture",
  "Textile",
  "Ceramics",
  "Decorative",
  "Other",
] as const;
export type MediumGroup = (typeof MEDIUM_GROUPS)[number];

export const THEMES = ["plaster", "gallery-white", "night"] as const;
export type Theme = (typeof THEMES)[number];

/** What an adapter produces: everything knowable from the museum API alone. */
export type RawArtwork = {
  id: string; // "source:nativeId"
  source: Source;
  nativeId: string;
  title: string;
  artist: string | null;
  date: string | null;
  dateStart: number | null;
  dateEnd: number | null;
  medium: string | null;
  mediumGroup: MediumGroup;
  dimensions: string | null;
  culture: string | null;
  dynasty: Dynasty | null;
  themes: ChinaTheme[];
  /** Text for the content filter (kept in the database so the filter can be re-run). */
  description: string | null;
  tags: string[];
  classification: string | null;
  imageSmall: string;
  imageMedium: string;
  imageLarge: string;
  /** IIIF base URL (AIC only) used for deep-zoom tiles. */
  iiifBase: string | null;
  width: number | null;
  height: number | null;
  museum: string;
  sourceUrl: string;
  creditLine: string | null;
};

/** The full normalized record, once color data has been computed. */
export type Artwork = RawArtwork & {
  dominantColor: string | null;
  palette: string[];
  hue: number | null;
  saturation: number | null;
  lightness: number | null;
  century: number | null;
  orientation: Orientation | null;
};

export type Orientation = "landscape" | "portrait" | "square";

export const idSchema = z.string().regex(/^(aic|met|cma):[A-Za-z0-9._-]{1,40}$/, "Invalid artwork id");

export function makeId(source: Source, nativeId: string | number): string {
  return `${source}:${nativeId}`;
}

export function orientationOf(w: number | null, h: number | null): Orientation | null {
  if (!w || !h) return null;
  const r = w / h;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

/** 1800-1899 is the 19th century; negatives are BCE centuries. */
export function centuryOf(year: number | null): number | null {
  if (year == null || !Number.isFinite(year) || year === 0) return null;
  return year > 0 ? Math.floor((year - 1) / 100) + 1 : Math.floor(year / 100);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export function centuryLabel(c: number): string {
  return c > 0 ? `${ordinal(c)} century` : `${ordinal(-c)} century BCE`;
}

/** Heuristic bucket from whichever classification strings a museum gives us. */
export function mediumGroupOf(...hints: Array<string | null | undefined>): MediumGroup {
  const s = hints.filter(Boolean).join(" | ").toLowerCase();
  if (!s) return "Other";
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  if (has("photograph", "daguerreotype", "gelatin silver", "albumen", "cyanotype", "tintype")) return "Photograph";
  if (has("woodcut", "etching", "engraving", "lithograph", "print", "aquatint", "mezzotint", "screenprint", "woodblock"))
    return "Print";
  if (has("hanging scroll", "handscroll", "hand scroll", "album leaf", "album of") || /\b(ink|colou?rs?|ink and colou?rs?)\b[^|]*\bon (silk|paper)\b/.test(s)) return "Painting";
  if (has("drawing", "watercolor", "pastel", "charcoal", "graphite", "pencil", "ink on paper", "gouache", "sketch"))
    return "Drawing";
  if (has("oil on", "tempera", "acrylic", "painting", "fresco", "oil paint", "panel")) return "Painting";
  if (has("porcelain", "stoneware", "earthenware", "celadon", "ceramic", "glaze", "pottery", "faience", "vase")) return "Ceramics";
  if (has("sculpture", "bronze", "marble", "stone", "granite", "terracotta", "relief", "statue", "wood carving", "jade", "nephrite"))
    return "Sculpture";
  // whole-word matching for the short ones ("lace" is inside "place", "rug" inside "drug")
  if (has("textile", "tapestry", "embroider", "costume", "carpet") || /\b(silk|cotton|wool|lace|rugs?)\b/.test(s))
    return "Textile";
  if (has("ceramic", "porcelain", "stoneware", "earthenware", "glaze", "pottery", "faience", "vase")) return "Ceramics";
  if (has("glass", "furniture", "silver", "gold", "enamel", "jewelry", "metalwork", "lacquer", "ivory", "armor"))
    return "Decorative";
  return "Other";
}

export function clean(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

export function toInt(v: unknown): number | null {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
