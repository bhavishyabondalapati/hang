import { clean, makeId, mediumGroupOf, toInt, type RawArtwork } from "../artwork";
import { parseDynasty } from "../dynasty";
import { classifyThemes } from "../themes";

export type MetRaw = {
  objectID: number;
  isPublicDomain?: boolean;
  primaryImage?: string;
  primaryImageSmall?: string;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  objectBeginDate?: number;
  objectEndDate?: number;
  medium?: string;
  dimensions?: string;
  culture?: string;
  period?: string;
  dynasty?: string;
  reign?: string;
  department?: string;
  creditLine?: string;
  objectURL?: string;
  classification?: string;
  objectName?: string;
  tags?: Array<{ term?: string }> | null;
};

/**
 * Accepts only isPublicDomain=true works with an image, from the Asian Art department, whose culture
 * contains "China". Anything else returns null.
 */
export function normalizeMet(raw: MetRaw): RawArtwork | null {
  if (!raw.isPublicDomain) return null;
  if (raw.department !== "Asian Art" || !/china/i.test(raw.culture ?? "")) return null;
  const small = clean(raw.primaryImageSmall);
  const large = clean(raw.primaryImage) ?? small;
  const title = clean(raw.title);
  if (!small || !large || !title) return null;
  const artist = clean(raw.artistDisplayName);
  const medium = clean(raw.medium);
  const mediumGroup = mediumGroupOf(raw.classification, raw.objectName, medium);
  const dateStart = toInt(raw.objectBeginDate);
  const dateEnd = toInt(raw.objectEndDate);
  return {
    id: makeId("met", raw.objectID),
    source: "met",
    nativeId: String(raw.objectID),
    title,
    artist: artist && !/^unknown/i.test(artist) ? artist : null,
    date: clean(raw.objectDate),
    dateStart,
    dateEnd,
    medium,
    mediumGroup,
    dimensions: clean(raw.dimensions),
    culture: clean(raw.culture),
    dynasty: parseDynasty([raw.culture, raw.period, raw.dynasty, raw.reign, raw.objectDate], dateStart, dateEnd),
    themes: classifyThemes({
      title, medium, mediumGroup, classification: [raw.classification, raw.objectName].filter(Boolean).join(" "),
      tags: (raw.tags ?? []).map((t) => t.term ?? "").filter(Boolean),
    }),
    imageSmall: small,
    imageMedium: small,
    imageLarge: large,
    iiifBase: null,
    // The Met API gives no pixel size; ingestion fills it from the fetched image.
    width: null,
    height: null,
    museum: "The Metropolitan Museum of Art",
    sourceUrl: clean(raw.objectURL) ?? `https://www.metmuseum.org/art/collection/search/${raw.objectID}`,
    creditLine: clean(raw.creditLine),
  };
}
