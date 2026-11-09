import { clean, makeId, mediumGroupOf, toInt, type RawArtwork } from "../artwork";

type CmaImage = { url?: string; width?: string | number; height?: string | number };
export type CmaRaw = {
  id: number;
  title?: string;
  creation_date?: string;
  creation_date_earliest?: number | null;
  creation_date_latest?: number | null;
  technique?: string;
  measurements?: string;
  culture?: string[];
  images?: { web?: CmaImage; print?: CmaImage; full?: CmaImage } | null;
  share_license_status?: string;
  url?: string;
  creditline?: string;
  type?: string;
  creators?: Array<{ description?: string; role?: string }>;
};

/** Only CC0 works with a web image are accepted. */
export function normalizeCma(raw: CmaRaw): RawArtwork | null {
  if (raw.share_license_status !== "CC0") return null;
  const web = raw.images?.web;
  const print = raw.images?.print;
  const title = clean(raw.title);
  if (!web?.url || !title) return null;
  // "John Singleton Copley (American, born ..., 1738–1815)" -> "John Singleton Copley"
  const creator = raw.creators?.find((c) => c.role === "artist") ?? raw.creators?.[0];
  const artist = clean(creator?.description?.replace(/\s*\(.*$/, ""));
  return {
    id: makeId("cma", raw.id),
    source: "cma",
    nativeId: String(raw.id),
    title,
    artist: artist && !/^unknown/i.test(artist) ? artist : null,
    date: clean(raw.creation_date),
    dateStart: toInt(raw.creation_date_earliest),
    dateEnd: toInt(raw.creation_date_latest),
    medium: clean(raw.technique),
    mediumGroup: mediumGroupOf(raw.type, raw.technique),
    dimensions: clean(raw.measurements),
    culture: clean(raw.culture?.[0]),
    imageSmall: web.url,
    imageMedium: print?.url ?? web.url,
    imageLarge: print?.url ?? web.url,
    iiifBase: null,
    width: toInt(web.width),
    height: toInt(web.height),
    museum: "Cleveland Museum of Art",
    sourceUrl: clean(raw.url) ?? `https://clevelandart.org/art/${raw.id}`,
    creditLine: clean(raw.creditline),
  };
}
