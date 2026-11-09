/**
 * Runs the content filter over works already in the database.
 *   npm run refilter                    both passes on works not yet screened
 *   npm run refilter -- --force         re-run everything from scratch
 *   npm run refilter -- --phase text    keyword pass only (backfills description/tags from the museum APIs)
 *   npm run refilter -- --phase text --recheck   re-run the keyword rules on stored text, no API calls (after editing the keyword list)
 *   npm run refilter -- --phase images  image pass only (scores are cached in .cache/image-scores.json,
 *                                       so changing thresholds in src/lib/image-filter.ts and re-running is instant)
 *   npm run refilter -- --limit 40      try it on a few works
 *
 * Pass 1 (keywords): title, artist, tags, classification, description. See src/lib/content-filter.ts.
 * Pass 2 (images): local NSFW classifier + CLIP zero-shot. See src/lib/image-filter.ts.
 * Hidden works get `hidden = true` and a `hidden_reason`; hidden-review.md is rewritten at the end.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { aicScreeningText, cmaScreeningText, metScreeningText, type AicRaw, type CmaRaw, type MetRaw } from "../src/lib/adapters";
import { screenText } from "../src/lib/content-filter";
import { createImageClassifier } from "../src/lib/image-classifier";
import { decideImage } from "../src/lib/image-filter";
import { fetchJson, fetchWithRetry, mapLimit } from "../src/lib/retry";
import { writeHiddenReview } from "./hidden-review";
import { metBase, metGaveUp, metSafe } from "./lib/met-polite";
import { loadScoreCache, saveScoreCache } from "./lib/score-cache";

config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1]! : d; };
const FORCE = flag("force");
/** --recheck: re-run the keyword rules on the text already stored (no museum API calls); hidden works that no longer match come back. */
const RECHECK = flag("recheck");
const PHASE = opt("phase", "all");
const LIMIT = parseInt(opt("limit", "0"), 10);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const db = getDb();
const A = schema.artworks;
type Row = { id: string; source: "aic" | "met" | "cma"; nativeId: string; title: string; artist: string | null; tags: string[]; classification: string | null; description: string | null; hidden: boolean; hiddenReason: string | null; screenedAt: Date | null; imageSmall: string };

async function loadRows(): Promise<Row[]> {
  const rows = (await db
    .select({ id: A.id, source: A.source, nativeId: A.nativeId, title: A.title, artist: A.artist, tags: A.tags, classification: A.classification, description: A.description, hidden: A.hidden, hiddenReason: A.hiddenReason, screenedAt: A.screenedAt, imageSmall: A.imageSmall })
    .from(A)
    .where(eq(A.collection, "china"))
    .orderBy(A.id)) as Row[];
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

/* ---------------- pass 1: keywords ---------------- */

async function backfill(rows: Row[]) {
  const todo = rows.filter((r) => FORCE || !r.screenedAt);
  const got = new Map<string, { description: string | null; tags: string[]; classification: string | null }>();
  log(`backfill: ${todo.length} works need their description/tags fetched`);

  const aic = todo.filter((r) => r.source === "aic");
  for (let i = 0; i < aic.length; i += 50) {
    const batch = aic.slice(i, i + 50);
    try {
      const f = "id,description,short_description,subject_titles,term_titles,classification_title,artwork_type_title,classification_titles";
      const res = await fetchJson<{ data: AicRaw[] }>(`https://api.artic.edu/api/v1/artworks?ids=${batch.map((b) => b.nativeId).join(",")}&limit=50&fields=${f}`, { headers: { "AIC-User-Agent": "hang-art-app (educational project)" }, retries: 7, baseMs: 3000 });
      for (const raw of res.data) got.set(`aic:${raw.id}`, aicScreeningText(raw));
    } catch (e) { log(`aic batch ${i}: ${(e as Error).message.slice(0, 60)}`); }
    await pause(1200);
  }
  log(`  aic: ${got.size}/${aic.length}`);

  const cma = todo.filter((r) => r.source === "cma");
  await mapLimit(cma, 4, async (r) => {
    try {
      const res = await fetchJson<{ data: CmaRaw }>(`https://openaccess-api.clevelandart.org/api/artworks/${r.nativeId}`, { retries: 5 });
      got.set(r.id, cmaScreeningText(res.data));
    } catch (e) { log(`cma ${r.id}: ${(e as Error).message.slice(0, 50)}`); }
  });
  log(`  cma: ${cma.filter((r) => got.has(r.id)).length}/${cma.length}`);

  const met = todo.filter((r) => r.source === "met");
  for (const r of met) {
    if (metGaveUp()) break;
    const raw = await metSafe<MetRaw>(`${metBase}/objects/${r.nativeId}`);
    if (raw) got.set(r.id, metScreeningText(raw));
  }
  log(`  met: ${met.filter((r) => got.has(r.id)).length}/${met.length}`);
  return got;
}

async function keywordPass(rows: Row[]) {
  const fetched = await backfill(rows);
  let newlyHidden = 0, unscreened = 0;
  await mapLimit(rows, 8, async (r) => {
    const text = fetched.get(r.id);
    const needsText = FORCE || !r.screenedAt;
    if (needsText && !text) unscreened++; // the museum API call failed: screened on title/artist/stored text only, not marked done
    const input = { title: r.title, artist: r.artist, tags: text?.tags ?? r.tags, classification: text?.classification ?? r.classification, description: text?.description ?? r.description };
    if (!needsText && r.hidden && !RECHECK) return; // already screened and hidden (keep decisions between runs unless --force / --recheck)
    const result = screenText(input);
    const set: Partial<typeof A.$inferInsert> = {};
    if (text) Object.assign(set, { description: text.description, tags: text.tags, classification: text.classification, screenedAt: new Date() });
    if (result.hidden) { set.hidden = true; set.hiddenReason = result.reasons.join(" | "); newlyHidden++; }
    else if (r.hidden && r.hiddenReason?.startsWith("keyword")) { set.hidden = false; set.hiddenReason = null; } // keyword list got narrower
    if (Object.keys(set).length) await db.update(A).set(set).where(eq(A.id, r.id));
    r.hidden = result.hidden || (r.hidden && !r.hiddenReason?.startsWith("keyword"));
    if (result.hidden) r.hiddenReason = result.reasons.join(" | ");
  });
  log(`keyword pass: ${newlyHidden} hidden. ${unscreened ? `WARNING: ${unscreened} works could not be fetched from their museum API and were screened on stored text only (re-run later)` : "all works had their text fetched"}`);
}

/* ---------------- pass 2: images ---------------- */

async function imagePass(rows: Row[]) {
  const cache = FORCE ? {} : loadScoreCache();
  const scope = rows.filter((r) => !(r.hidden && r.hiddenReason?.startsWith("keyword")));
  const todo = scope.filter((r) => !cache[r.id] || "error" in cache[r.id]!);
  log(`image pass: ${scope.length} works in scope, ${todo.length} to score (${scope.length - todo.length} cached)`);

  if (todo.length) {
    log("loading local models (first run downloads them once)…");
    const classifier = await createImageClassifier();
    let done = 0;
    await mapLimit(todo, 2, async (r) => {
      try {
        const res = await fetchWithRetry(r.imageSmall, { retries: 4, baseMs: 1500 });
        cache[r.id] = await classifier.score(Buffer.from(await res.arrayBuffer()));
        if (r.source === "met") await pause(300);
      } catch (e) {
        cache[r.id] = { error: (e as Error).message.slice(0, 80) };
      }
      if (++done % 50 === 0) { saveScoreCache(cache); log(`scored ${done}/${todo.length}`); }
    });
    saveScoreCache(cache);
  }

  let hidden = 0, unscored = 0, unhidden = 0;
  for (const r of scope) {
    const c = cache[r.id];
    let set: Partial<typeof A.$inferInsert> | null = null;
    if (!c || "error" in c) {
      // can't see it, can't clear it: when in doubt, hide
      unscored++;
      set = { hidden: true, hiddenReason: `image: could not be scored (${c && "error" in c ? c.error : "no image"})` };
    } else {
      const d = decideImage(c);
      if (d.hidden) set = { hidden: true, hiddenReason: d.reason };
      else if (r.hidden && r.hiddenReason?.startsWith("image")) { set = { hidden: false, hiddenReason: null }; unhidden++; }
    }
    if (set?.hidden) hidden++;
    if (set) await db.update(A).set(set).where(eq(A.id, r.id));
  }
  log(`image pass: ${hidden} hidden (${unscored} could not be scored), ${unhidden} brought back after re-tuning`);
}

/* ---------------- main ---------------- */

const rows = await loadRows();
log(`${rows.length} works in the Chinese collection`);
if (PHASE === "all" || PHASE === "text") await keywordPass(rows);
if (PHASE === "all" || PHASE === "images") await imagePass(await loadRows());
const r = await writeHiddenReview();
log("wrote hidden-review.md:", JSON.stringify(r));
