/**
 * Review helper: builds a contact sheet (a grid of thumbnails) of the highest-scoring works for one image-filter signal,
 * from the cached model scores, so you can judge a threshold by eye.
 *   npx tsx scripts/contact-sheet.ts <signal> <from> <count> <out.jpg> [all|hidden|visible]
 *   signal: nsfw | total | horror | demons | violence | death | nudity
 * Prints the ids and titles in row-major order next to the sheet.
 */
import sharp from "sharp";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { loadScoreCache } from "./lib/score-cache";
import { UNWANTED_LABELS } from "../src/lib/image-filter";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL!);
const cache = loadScoreCache();
const mode = process.argv[6] ?? 'all';
const rows = (mode === 'hidden' ? await sql`select id, title, image_small url from artworks where hidden and hidden_reason like 'image%'` : mode === 'visible' ? await sql`select id, title, image_small url from artworks where collection='china' and not hidden` : await sql`select id, title, image_small url from artworks where collection='china' and not (hidden and hidden_reason like 'keyword%')`) as Array<{ id: string; title: string; url: string }>;
const unwanted = Object.values(UNWANTED_LABELS).flat();
const score = (id: string, kind: string) => {
  const c = cache[id]; if (!c || "error" in c) return 0;
  if (kind === "nsfw") return c.nsfw;
  if (kind === "total") return unwanted.reduce((a, l) => a + (c.labels[l] ?? 0), 0);
  return Math.max(...(UNWANTED_LABELS[kind] ?? []).map((l) => c.labels[l] ?? 0));
};
async function sheet(kind: string, from: number, n: number, out: string) {
  const top = [...rows].sort((a, b) => score(b.id, kind) - score(a.id, kind)).slice(from, from + n);
  const tiles = await Promise.all(top.map(async (r) => {
    try { return await sharp(Buffer.from(await (await fetch(r.url, { headers: { "User-Agent": "Hang/0.1" } })).arrayBuffer())).resize(200, 200, { fit: "contain", background: "#777" }).jpeg().toBuffer(); }
    catch { return await sharp({ create: { width: 200, height: 200, channels: 3, background: "#f0f" } }).jpeg().toBuffer(); }
  }));
  const cols = 6;
  await sharp({ create: { width: cols * 204, height: Math.ceil(n / cols) * 204, channels: 3, background: "#fff" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 204, top: Math.floor(i / cols) * 204 }))).jpeg({ quality: 80 }).toFile(out);
  console.log(`\n${out}  (${kind}, ranks ${from + 1}-${from + n}, row-major)`);
  top.forEach((r, i) => console.log(String(i + 1).padStart(2), score(r.id, kind).toFixed(2), r.id.padEnd(11), r.title.slice(0, 50)));
}
const [kind = "total", from = "0", n = "24", out = "screenshots/tmp/sheet.jpg"] = process.argv.slice(2);
await sheet(kind, parseInt(from, 10), parseInt(n, 10), out);
