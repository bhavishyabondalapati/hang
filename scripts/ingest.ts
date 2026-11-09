/**
 * Seeds Postgres with public-domain artworks from three museum APIs.
 *   npm run ingest                       ~1000 per museum
 *   npm run ingest -- --per-museum 50    small test run
 *   npm run ingest -- --only aic,cma     subset
 *   npm run ingest -- --force            recompute colours for works already stored
 * Idempotent: rows are upserted by id; works that already have a palette are skipped.
 */
import { config } from "dotenv";
import { inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { AIC_FIELDS, normalizeAic, normalizeCma, normalizeMet, type AicRaw, type CmaRaw, type MetRaw } from "../src/lib/adapters";
import { centuryOf, orientationOf, type RawArtwork, type Source } from "../src/lib/artwork";
import { analyseImage } from "../src/lib/ingest-image";
import { fetchJson, fetchWithRetry, hash01, mapLimit } from "../src/lib/retry";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const PER = parseInt(opt("per-museum", "1000"), 10);
const ONLY = opt("only", "aic,met,cma").split(",") as Source[];
const FORCE = flag("force");
const CONC = parseInt(opt("concurrency", "5"), 10);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- collectors: each returns up to `n` RawArtwork ---------- */

async function collectAic(n: number): Promise<RawArtwork[]> {
  const out: RawArtwork[] = [];
  const seen = new Set<string>();
  for (let page = 1; out.length < n && page <= 60; page++) {
    const url =
      `https://api.artic.edu/api/v1/artworks/search?query[bool][must][0][term][is_public_domain]=true` +
      `&query[bool][must][1][exists][field]=image_id&limit=100&page=${page}&fields=${AIC_FIELDS}`;
    const res = await fetchJson<{ data: AicRaw[] }>(encodeURI(url).replace(/%5B/g, "[").replace(/%5D/g, "]"), {
      headers: { "AIC-User-Agent": "hang-art-app (educational project)" },
    });
    if (!res.data.length) break;
    for (const r of res.data) {
      const a = normalizeAic(r);
      if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
    }
    log(`aic page ${page}: ${out.length}/${n}`);
    await pause(300);
  }
  return out.slice(0, n);
}

const MET_TERMS = [
  "painting", "landscape", "portrait", "flowers", "river", "woman", "city", "sky", "japan",
  "still life", "drawing", "sculpture", "textile", "ceramic", "photograph", "sea", "mountain", "night",
];

async function collectMet(n: number): Promise<RawArtwork[]> {
  const base = "https://collectionapi.metmuseum.org/public/collection/v1";
  const pools: number[][] = [];
  for (const q of MET_TERMS) {
    const r = await fetchJson<{ objectIDs: number[] | null }>(
      `${base}.1/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(q)}&limit=120&offset=0`,
    );
    pools.push((r.objectIDs ?? []).slice(0, 120));
    await pause(150);
  }
  // Interleave search terms so the sample is varied, then dedupe.
  const ids: number[] = [];
  const seenId = new Set<number>();
  for (let i = 0; i < 120; i++) for (const p of pools) { const id = p[i]; if (id && !seenId.has(id)) { seenId.add(id); ids.push(id); } }
  log(`met candidates: ${ids.length}`);

  const out: RawArtwork[] = [];
  for (let i = 0; i < ids.length && out.length < n; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const objs = await mapLimit(chunk, 4, async (id) => {
      try { return await fetchJson<MetRaw>(`${base}/objects/${id}`); } catch { return null; }
    });
    for (const o of objs) { const a = o && normalizeMet(o); if (a) out.push(a); }
    log(`met objects: ${out.length}/${n}`);
    await pause(250);
  }
  return out.slice(0, n);
}

async function collectCma(n: number): Promise<RawArtwork[]> {
  const base = "https://openaccess-api.clevelandart.org/api/artworks/";
  const first = await fetchJson<{ info: { total: number } }>(`${base}?cc0&has_image=1&limit=1`);
  const pages = Math.ceil(n / 100);
  const stride = Math.max(100, Math.floor(first.info.total / pages)); // sample across the whole collection
  const out: RawArtwork[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < pages && out.length < n; p++) {
    const res = await fetchJson<{ data: CmaRaw[] }>(`${base}?cc0&has_image=1&limit=100&skip=${p * stride}`);
    for (const r of res.data) { const a = normalizeCma(r); if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); } }
    log(`cma page ${p + 1}/${pages}: ${out.length}/${n}`);
    await pause(300);
  }
  return out.slice(0, n);
}

/* ---------- enrich + store ---------- */

async function existingIds(ids: string[]): Promise<Set<string>> {
  const db = getDb();
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db
      .select({ id: schema.artworks.id })
      .from(schema.artworks)
      .where(inArray(schema.artworks.id, ids.slice(i, i + 500)));
    for (const r of rows) have.add(r.id);
  }
  return have;
}

async function enrichAndStore(items: RawArtwork[]) {
  const db = getDb();
  const done = FORCE ? new Set<string>() : await existingIds(items.map((i) => i.id));
  const todo = items.filter((i) => !done.has(i.id));
  log(`${items.length} collected, ${items.length - todo.length} already stored, ${todo.length} to analyse`);
  let ok = 0, failed = 0;
  const rows: (typeof schema.artworks.$inferInsert)[] = [];

  await mapLimit(todo, CONC, async (a) => {
    try {
      const res = await fetchWithRetry(a.imageSmall, { retries: 4 });
      const info = await analyseImage(Buffer.from(await res.arrayBuffer()));
      const width = a.width ?? info.width;
      const height = a.height ?? info.height;
      rows.push({
        id: a.id, source: a.source, nativeId: a.nativeId, title: a.title, artist: a.artist, date: a.date,
        dateStart: a.dateStart, dateEnd: a.dateEnd, century: centuryOf(a.dateStart ?? a.dateEnd),
        medium: a.medium, mediumGroup: a.mediumGroup, dimensions: a.dimensions, culture: a.culture,
        imageSmall: a.imageSmall, imageMedium: a.imageMedium, imageLarge: a.imageLarge, iiifBase: a.iiifBase,
        width, height, orientation: orientationOf(width, height),
        dominantColor: info.dominantColor, palette: info.palette.map((p) => p.hex),
        hue: info.hue, saturation: info.saturation, lightness: info.lightness,
        museum: a.museum, sourceUrl: a.sourceUrl, creditLine: a.creditLine, shuffle: hash01(a.id),
      });
      ok++;
    } catch (e) {
      failed++;
      log(`skip ${a.id}: ${(e as Error).message}`);
    }
    if ((ok + failed) % 50 === 0) log(`analysed ${ok + failed}/${todo.length}`);
  });

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    await db
      .insert(schema.artworks)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.artworks.id,
        set: Object.fromEntries(
          Object.keys(batch[0]!)
            .filter((k) => k !== "id" && k !== "createdAt")
            .map((k) => [k, sql.raw(`excluded."${toColumn(k)}"`)]),
        ),
      });
  }
  log(`stored ${ok}, failed ${failed}`);
}

const COLUMN_OVERRIDES: Record<string, string> = {
  nativeId: "native_id", dateStart: "date_start", dateEnd: "date_end", mediumGroup: "medium_group",
  imageSmall: "image_small", imageMedium: "image_medium", imageLarge: "image_large", iiifBase: "iiif_base",
  dominantColor: "dominant_color", sourceUrl: "source_url", creditLine: "credit_line",
};
const toColumn = (k: string) => COLUMN_OVERRIDES[k] ?? k;

const collectors: Record<Source, (n: number) => Promise<RawArtwork[]>> = { aic: collectAic, met: collectMet, cma: collectCma };

for (const src of ONLY) {
  log(`== ${src} ==`);
  const items = await collectors[src](PER);
  await enrichAndStore(items);
}
const [{ n } = { n: 0 }] = await getDb().select({ n: sql<number>`count(*)::int` }).from(schema.artworks);
log(`done. artworks in database: ${n}`);
