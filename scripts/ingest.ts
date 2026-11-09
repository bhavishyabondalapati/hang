/**
 * Seeds Postgres with public-domain CHINESE art from three museum APIs, balanced across eight themes.
 *   npm run ingest                         ~2,000 works, ~250 per theme (Cleveland and Art Institute first, the Met fills the rest)
 *   npm run ingest -- --target 200         small test run
 *   npm run ingest -- --only cma,aic       subset of museums
 *   npm run ingest -- --force              re-analyse works that are already stored
 *   npm run ingest -- --dry                run everything, including the content filters, but write nothing
 * Idempotent: rows are upserted by id and works already stored are skipped (unless --force).
 * Every candidate must pass its museum adapter (public domain / CC0, right department, China),
 * match the theme it was searched for, and pass the image quality check (no tiny, blank or mostly-black images).
 * Then the content filter runs on it: keywords first (hits are stored as hidden, no image work), then the local
 * NSFW + CLIP image models. Hidden works stay in the table (so they are never collected again) but are invisible
 * everywhere and do not count towards a theme's target. hidden-review.md is rewritten at the end.
 */
import { config } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { AIC_FIELDS, normalizeAic, normalizeCma, normalizeMet, type AicRaw, type CmaRaw, type MetRaw } from "../src/lib/adapters";
import { centuryOf, orientationOf, type RawArtwork, type Source } from "../src/lib/artwork";
import { screenText } from "../src/lib/content-filter";
import { analyseImage, metOriginalTooSmall, rejectReason } from "../src/lib/ingest-image";
import { createImageClassifier, type ImageClassifier } from "../src/lib/image-classifier";
import { decideImage } from "../src/lib/image-filter";
import { fetchJson, fetchWithRetry, hash01, mapLimit } from "../src/lib/retry";
import { metBase, metGaveUp, metSafe } from "./lib/met-polite";
import { writeHiddenReview } from "./hidden-review";
import { loadScoreCache, saveScoreCache } from "./lib/score-cache";
import { CHINA_THEMES, THEME_QUERIES, type ChinaTheme } from "../src/lib/themes";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const TARGET = parseInt(opt("target", "2000"), 10);
const ONLY = opt("only", "cma,aic,met").split(",") as Source[];
const FORCE = flag("force");
/** --dry: run everything (including the content filters) but write nothing: no database rows, no score cache, no review file. */
const DRY = flag("dry");
/** Most works one museum may supply per theme. Cleveland and the Art Institute lean first; the Met fills what is left. */
const CAP: Record<Source, number> = { cma: 150, aic: 120, met: 200 };
const THEME_TARGET = Math.round(TARGET / CHINA_THEMES.length);
/** Trim themes that overshoot their target by more than this factor (works on walls or liked are never trimmed). */
const OVERSHOOT = 1.15;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
/** Works per theme, kept up to date as we store (a work with two themes counts for both). */
const have: Record<string, number> = Object.fromEntries(CHINA_THEMES.map((t) => [t.slug, 0]));
/** Ask for a bit more than the deficit, because some candidates will fail the image check. */
const want = (src: Source, theme: ChinaTheme) => Math.min(CAP[src], Math.ceil(Math.max(0, THEME_TARGET - (have[theme] ?? 0)) * 1.15));

type Candidate = RawArtwork;
const seen = new Set<string>();

/* ---------- collectors: for one theme, return up to `n` candidates matching it ---------- */

async function cmaForTheme(theme: ChinaTheme, n: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const term of THEME_QUERIES[theme]) {
    for (let skip = 0; skip < 600 && out.length < n; skip += 100) {
      const url = `https://openaccess-api.clevelandart.org/api/artworks/?cc0&has_image=1&department=${encodeURIComponent("Chinese Art")}&q=${encodeURIComponent(term)}&limit=100&skip=${skip}`;
      const res = await fetchJson<{ data: CmaRaw[] }>(url);
      if (!res.data.length) break;
      for (const r of res.data) {
        const a = normalizeCma(r);
        if (a && a.themes.includes(theme) && !seen.has(a.id) && out.length < n) { seen.add(a.id); out.push(a); }
      }
      await pause(300);
    }
    if (out.length >= n) break;
  }
  return out;
}

async function aicForTheme(theme: ChinaTheme, n: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const term of THEME_QUERIES[theme]) {
    for (let page = 1; page <= 6 && out.length < n; page++) {
      const p = new URLSearchParams({
        q: term, limit: "100", page: String(page), fields: AIC_FIELDS,
        "query[bool][must][0][term][is_public_domain]": "true",
        "query[bool][must][1][term][department_title.keyword]": "Arts of Asia",
        "query[bool][must][2][match][place_of_origin]": "China",
        "query[bool][must][3][exists][field]": "image_id",
      });
      let res: { data: AicRaw[] };
      try {
        // AIC rate-limits (429) quickly: long backoff, generous retries, and a gentle pace between pages
        res = await fetchJson<{ data: AicRaw[] }>(`https://api.artic.edu/api/v1/artworks/search?${p}`, {
          headers: { "AIC-User-Agent": "hang-art-app (educational project)" }, retries: 7, baseMs: 3000,
        });
      } catch (e) {
        log(`aic "${term}" page ${page}: ${(e as Error).message.slice(0, 60)}; moving on`);
        break;
      }
      if (!res.data.length) break;
      for (const r of res.data) {
        const a = normalizeAic(r);
        if (a && a.themes.includes(theme) && !seen.has(a.id) && out.length < n) { seen.add(a.id); out.push(a); }
      }
      await pause(1200);
    }
    if (out.length >= n) break;
  }
  return out;
}

async function metForTheme(theme: ChinaTheme, n: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let tried = 0;
  for (const term of THEME_QUERIES[theme]) {
    if (metGaveUp() || out.length >= n) break;
    const url = `${metBase}.1/search?departmentId=6&hasImages=true&isPublicDomain=true&geoLocation=China&q=${encodeURIComponent(term)}&limit=100&offset=0`;
    const ids = (await metSafe<{ objectIDs: number[] | null }>(url))?.objectIDs ?? [];
    for (const id of ids) {
      if (metGaveUp() || out.length >= n || tried >= n * 3) break; // never fetch more than 3 objects per accepted one
      if (seen.has(`met:${id}`)) continue;
      tried++;
      const raw = await metSafe<MetRaw>(`${metBase}/objects/${id}`);
      const a = raw && normalizeMet(raw);
      if (a && a.themes.includes(theme) && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
    }
  }
  return out;
}

const collectors: Record<Source, (t: ChinaTheme, n: number) => Promise<Candidate[]>> = { cma: cmaForTheme, aic: aicForTheme, met: metForTheme };

/* ---------- enrich + store ---------- */

async function storedChinaIds(ids: string[]): Promise<Set<string>> {
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await getDb()
      .select({ id: schema.artworks.id })
      .from(schema.artworks)
      .where(and(inArray(schema.artworks.id, ids.slice(i, i + 500)), eq(schema.artworks.collection, "china")));
    for (const r of rows) have.add(r.id);
  }
  return have;
}

const COLUMN_OVERRIDES: Record<string, string> = {
  nativeId: "native_id", dateStart: "date_start", dateEnd: "date_end", mediumGroup: "medium_group",
  imageSmall: "image_small", imageMedium: "image_medium", imageLarge: "image_large", iiifBase: "iiif_base",
  dominantColor: "dominant_color", sourceUrl: "source_url", creditLine: "credit_line",
};
const toColumn = (k: string) => COLUMN_OVERRIDES[k] ?? k;

async function enrichAndStore(src: Source, items: Candidate[]) {
  const db = getDb();
  const done = FORCE ? new Set<string>() : await storedChinaIds(items.map((i) => i.id));
  const todo = items.filter((i) => !done.has(i.id));
  log(`${src}: ${items.length} candidates, ${items.length - todo.length} already stored, ${todo.length} to analyse`);
  const rows: (typeof schema.artworks.$inferInsert)[] = [];
  const rejected: Record<string, number> = {};
  let failed = 0;
  let hiddenByKeyword = 0, hiddenByImage = 0;
  const scores = loadScoreCache();
  let classifier: ImageClassifier | null = null;
  const screening = (a: Candidate) => ({ description: a.description, tags: a.tags, classification: a.classification });

  await mapLimit(todo, src === "met" ? 2 : 5, async (a) => {
    try {
      // Content filter, pass 1 (keywords): a hit is stored hidden straight away, with no image work.
      const kw = screenText(a);
      if (kw.hidden) {
        hiddenByKeyword++;
        rows.push({
          id: a.id, source: a.source, nativeId: a.nativeId, title: a.title, artist: a.artist, date: a.date, dateStart: a.dateStart, dateEnd: a.dateEnd,
          medium: a.medium, mediumGroup: a.mediumGroup, dimensions: a.dimensions, culture: a.culture, dynasty: a.dynasty, themes: a.themes, collection: "china",
          imageSmall: a.imageSmall, imageMedium: a.imageMedium, imageLarge: a.imageLarge, iiifBase: a.iiifBase, width: a.width, height: a.height,
          museum: a.museum, sourceUrl: a.sourceUrl, creditLine: a.creditLine, shuffle: hash01(a.id), ...screening(a),
          hidden: true, hiddenReason: kw.reasons.join(" | "), screenedAt: new Date(),
        });
        return;
      }
      const res = await fetchWithRetry(a.imageSmall, { retries: 4 });
      const buf = Buffer.from(await res.arrayBuffer());
      const info = await analyseImage(buf);
      const width = a.width ?? info.width;
      const height = a.height ?? info.height;
      let why: string | null = null;
      if (src === "met") {
        // size from the original's file size (HEAD, nothing downloaded); the rest of the checks as usual
        const head = await fetch(a.imageLarge, { method: "HEAD" }).catch(() => null);
        const bytes = head?.ok ? Number(head.headers.get("content-length")) || null : null;
        if (metOriginalTooSmall(bytes)) why = `tiny image (original ${bytes} bytes)`;
        await pause(250);
      }
      why ??= rejectReason({ width, height, dark: info.dark, light: info.light, spread: info.spread }, { skipSize: src === "met" });
      if (why) { const k = why.replace(/\s*\(.*\)/, ""); rejected[k] = (rejected[k] ?? 0) + 1; return; }
      // Content filter, pass 2 (images): local NSFW + CLIP models. Anything we cannot score is hidden: when in doubt, hide.
      classifier ??= await createImageClassifier();
      let imageHidden: string | null = null;
      try {
        const s = await classifier.score(Buffer.from(buf));
        scores[a.id] = s;
        imageHidden = decideImage(s).reason;
      } catch (e) {
        scores[a.id] = { error: (e as Error).message.slice(0, 80) };
        imageHidden = `image: could not be scored (${(e as Error).message.slice(0, 60)})`;
      }
      if (imageHidden) hiddenByImage++;
      rows.push({
        id: a.id, source: a.source, nativeId: a.nativeId, title: a.title, artist: a.artist, date: a.date,
        hidden: !!imageHidden, hiddenReason: imageHidden, screenedAt: new Date(), ...screening(a),
        dateStart: a.dateStart, dateEnd: a.dateEnd, century: centuryOf(a.dateStart ?? a.dateEnd),
        medium: a.medium, mediumGroup: a.mediumGroup, dimensions: a.dimensions, culture: a.culture,
        dynasty: a.dynasty, themes: a.themes, collection: "china",
        imageSmall: a.imageSmall, imageMedium: a.imageMedium, imageLarge: a.imageLarge, iiifBase: a.iiifBase,
        width, height, orientation: orientationOf(width, height),
        dominantColor: info.dominantColor, palette: info.palette.map((p) => p.hex),
        hue: info.hue, saturation: info.saturation, lightness: info.lightness,
        museum: a.museum, sourceUrl: a.sourceUrl, creditLine: a.creditLine, shuffle: hash01(a.id),
      });
    } catch (e) {
      failed++;
      log(`skip ${a.id}: ${(e as Error).message}`);
    }
  });

  for (let i = 0; i < rows.length && !DRY; i += 50) {
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
  if (!DRY) saveScoreCache(scores);
  for (const r of rows) if (!r.hidden) for (const t of r.themes ?? []) have[t] = (have[t] ?? 0) + 1;
  log(`${src}: ${DRY ? "DRY RUN, would store" : "stored"} ${rows.length} (${hiddenByKeyword} hidden by keywords, ${hiddenByImage} hidden by the image models), failed ${failed}, rejected by quality check: ${JSON.stringify(rejected)}`);
}

/* ---------- main ---------- */

// Works already stored count towards each theme, and are never collected again.
{
  const rows = await getDb().select({ id: schema.artworks.id, themes: schema.artworks.themes, hidden: schema.artworks.hidden }).from(schema.artworks).where(eq(schema.artworks.collection, "china"));
  // hidden works are remembered (never collected again) but do not count towards a theme's target
  for (const r of rows) { seen.add(r.id); if (!r.hidden) for (const t of r.themes) have[t] = (have[t] ?? 0) + 1; }
  log(`already stored (china): ${rows.length}. per theme: ${JSON.stringify(have)}. target per theme: ${THEME_TARGET}`);
}

for (const src of ONLY) {
  log(`== ${src} ==`);
  const all: Candidate[] = [];
  for (const t of CHINA_THEMES) {
    if (src === "met" && metGaveUp()) break;
    const n = want(src, t.slug);
    if (n <= 0) { log(`${src} ${t.slug}: target already met`); continue; }
    let got: Candidate[] = [];
    try { got = await collectors[src](t.slug, n); } catch (e) { log(`${src} ${t.slug}: failed (${(e as Error).message.slice(0, 70)}); continuing`); }
    log(`${src} ${t.slug}: ${got.length} new candidates (asked ${n})`);
    all.push(...got);
  }
  await enrichAndStore(src, all);
}

/* ---------- trim themes that overshoot ---------- */
if (!DRY) {
  const db = getDb();
  const cap = Math.ceil(THEME_TARGET * OVERSHOOT);
  for (const t of CHINA_THEMES) {
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.artworks).where(and(eq(schema.artworks.collection, "china"), eq(schema.artworks.hidden, false), sql`${schema.artworks.themes} && ARRAY[${t.slug}]::text[]`));
    const extra = n - cap;
    if (extra <= 0) continue;
    // Only single-theme works, never anything on a wall or liked; furthest along the stable shuffle goes first.
    const res = await db.execute(sql`
      delete from artworks where id in (
        select id from artworks a
        where collection = 'china' and not hidden and themes = ARRAY[${t.slug}]::text[]
          and not exists (select 1 from wall_items w where w.artwork_id = a.id)
          and not exists (select 1 from likes l where l.artwork_id = a.id)
        order by shuffle desc limit ${extra})`);
    log(`trimmed ${t.slug}: had ${n}, cap ${cap}, removed ${(res as unknown as { rowCount?: number }).rowCount ?? "?"}`);
  }
}

const db = getDb();
const byMuseum = await db.select({ source: schema.artworks.source, n: sql<number>`count(*)::int` }).from(schema.artworks).where(and(eq(schema.artworks.collection, "china"), eq(schema.artworks.hidden, false))).groupBy(schema.artworks.source);
const byTheme = await db.execute(sql`select t as theme, count(*)::int as n from artworks, unnest(themes) t where collection = 'china' and not hidden group by t order by t`);
if (!DRY) log("hidden-review.md:", JSON.stringify(await writeHiddenReview()));
log("visible china works by museum:", JSON.stringify(byMuseum));
log("visible china works by theme:", JSON.stringify((byTheme as unknown as { rows?: unknown[] }).rows ?? byTheme));
