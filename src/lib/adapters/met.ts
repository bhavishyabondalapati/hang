import { clean, makeId, mediumGroupOf, toInt, type RawArtwork } from "../artwork";

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
  creditLine?: string;
  objectURL?: string;
  classification?: string;
  objectName?: string;
};

/** Only isPublicDomain=true works with an image are accepted. */
export function normalizeMet(raw: MetRaw): RawArtwork | null {
  if (!raw.isPublicDomain) return null;
  const small = clean(raw.primaryImageSmall);
  const large = clean(raw.primaryImage) ?? small;
  const title = clean(raw.title);
  if (!small || !large || !title) return null;
  const artist = clean(raw.artistDisplayName);
  return {
    id: makeId("met", raw.objectID),
    source: "met",
    nativeId: String(raw.objectID),
    title,
    artist: artist && !/^unknown/i.test(artist) ? artist : null,
    date: clean(raw.objectDate),
    dateStart: toInt(raw.objectBeginDate),
    dateEnd: toInt(raw.objectEndDate),
    medium: clean(raw.medium),
    mediumGroup: mediumGroupOf(raw.classification, raw.objectName, raw.medium),
    dimensions: clean(raw.dimensions),
    culture: clean(raw.culture),
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
