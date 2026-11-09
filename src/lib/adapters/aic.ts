import { clean, makeId, mediumGroupOf, toInt, type RawArtwork } from "../artwork";

export const AIC_FIELDS = [
  "id", "title", "artist_display", "artist_title", "date_display", "date_start", "date_end",
  "medium_display", "dimensions", "place_of_origin", "image_id", "thumbnail", "is_public_domain",
  "credit_line", "classification_title", "artwork_type_title",
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
};

const IIIF = "https://www.artic.edu/iiif/2";

/** Returns null for works that are not public domain or have no image. */
export function normalizeAic(raw: AicRaw): RawArtwork | null {
  if (!raw.is_public_domain || !raw.image_id) return null;
  const title = clean(raw.title);
  if (!title) return null;
  const base = `${IIIF}/${raw.image_id}`;
  // artist_title is the clean name. For unattributed works artist_display is just a
  // place ("India\nNagapattinam"), so only fall back to it when it looks like
  // "Name (Nationality, 1853–1890)".
  const firstLine = typeof raw.artist_display === "string" ? raw.artist_display.split("\n")[0] : null;
  const fromDisplay = firstLine && /\(.*\)/.test(firstLine) ? clean(firstLine.replace(/\s*\(.*$/, "")) : null;
  const artist = clean(raw.artist_title) ?? fromDisplay;
  return {
    id: makeId("aic", raw.id),
    source: "aic",
    nativeId: String(raw.id),
    title,
    artist: artist && !/^unknown/i.test(artist) ? artist : null,
    date: clean(raw.date_display),
    dateStart: toInt(raw.date_start),
    dateEnd: toInt(raw.date_end),
    medium: clean(raw.medium_display),
    mediumGroup: mediumGroupOf(raw.artwork_type_title, raw.classification_title, raw.medium_display),
    dimensions: clean(raw.dimensions),
    culture: clean(raw.place_of_origin),
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
