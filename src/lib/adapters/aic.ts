import { clean, makeId, mediumGroupOf, toInt, type RawArtwork } from "../artwork";
import { parseDynasty } from "../dynasty";
import { stripHtml } from "../content-filter";
import { classifyThemes } from "../themes";

export const AIC_FIELDS = [
  "id", "title", "artist_display", "artist_title", "date_display", "date_start", "date_end",
  "medium_display", "dimensions", "place_of_origin", "image_id", "thumbnail", "is_public_domain",
  "credit_line", "classification_title", "artwork_type_title", "department_title", "style_title", "short_description",
  "description", "subject_titles", "term_titles", "classification_titles",
].join(",");

export type AicRaw = {
  id: number;
  title?: string | null;
  artist_display?: string | null;
  artist_title?: string | null;
  date_display?: string | null;
  date_start?: number | null;
  date_end?: number | null;
  medium_display?: string | null;
  dimensions?: string | null;
  place_of_origin?: string | null;
  image_id?: string | null;
  thumbnail?: { width?: number; height?: number; alt_text?: string | null } | null;
  is_public_domain?: boolean | null;
  credit_line?: string | null;
  classification_title?: string | null;
  artwork_type_title?: string | null;
  department_title?: string | null;
  style_title?: string | null;
  short_description?: string | null;
  description?: string | null;
  subject_titles?: string[] | null;
  term_titles?: string[] | null;
  classification_titles?: string[] | null;
};

const IIIF = "https://www.artic.edu/iiif/2";

/** The text the content filter reads, from an AIC record (also used to backfill works stored before the filter existed). */
export function aicScreeningText(raw: AicRaw) {
  return {
    description: clean([raw.short_description, raw.description].filter(Boolean).map((d) => stripHtml(d!)).join(" ")),
    tags: [...new Set([...(raw.subject_titles ?? []), ...(raw.term_titles ?? [])].map((t) => t.trim()).filter(Boolean))],
    classification: clean([...new Set([raw.classification_title, raw.artwork_type_title, ...(raw.classification_titles ?? [])].filter(Boolean))].join(", ")),
  };
}

/**
 * Accepts only public-domain works with an image from the Arts of Asia department whose place of
 * origin is China. Anything else returns null.
 */
export function normalizeAic(raw: AicRaw): RawArtwork | null {
  if (!raw.is_public_domain || !raw.image_id) return null;
  if (raw.department_title !== "Arts of Asia" || !/china/i.test(raw.place_of_origin ?? "")) return null;
  const title = clean(raw.title);
  if (!title) return null;
  const base = `${IIIF}/${raw.image_id}`;
  // artist_title is the clean name. For unattributed works artist_display is just a place
  // ("India\nNagapattinam"), so only fall back to it when it looks like "Name (Nationality, 1853–1890)".
  const firstLine = typeof raw.artist_display === "string" ? raw.artist_display.split("\n")[0] : null;
  const fromDisplay = firstLine && /\(.*\)/.test(firstLine) ? clean(firstLine.replace(/\s*\(.*$/, "")) : null;
  const artist = clean(raw.artist_title) ?? fromDisplay;
  const medium = clean(raw.medium_display);
  const mediumGroup = mediumGroupOf(raw.artwork_type_title, raw.classification_title, medium);
  const dateStart = toInt(raw.date_start);
  const dateEnd = toInt(raw.date_end);
  return {
    id: makeId("aic", raw.id),
    source: "aic",
    nativeId: String(raw.id),
    title,
    artist: artist && !/^unknown/i.test(artist) ? artist : null,
    date: clean(raw.date_display),
    dateStart,
    dateEnd,
    medium,
    mediumGroup,
    dimensions: clean(raw.dimensions),
    culture: clean(raw.place_of_origin),
    dynasty: parseDynasty([raw.date_display, raw.style_title, raw.place_of_origin], dateStart, dateEnd),
    themes: classifyThemes({
      title, medium, mediumGroup, classification: [raw.classification_title, raw.artwork_type_title].filter(Boolean).join(" "),
      description: raw.short_description,
    }),
    ...aicScreeningText(raw),
    imageSmall: `${base}/full/400,/0/default.jpg`,
    imageMedium: `${base}/full/843,/0/default.jpg`,
    imageLarge: `${base}/full/1686,/0/default.jpg`,
    iiifBase: base,
    width: toInt(raw.thumbnail?.width),
    height: toInt(raw.thumbnail?.height),
    museum: "Art Institute of Chicago",
    sourceUrl: `https://www.artic.edu/artworks/${raw.id}`,
    creditLine: clean(raw.credit_line),
  };
}
