/**
 * Writes hidden-review.md: every work hidden by the content filter (id, title, reason), so a person can check it.
 *   npm run review
 * Also imported by refilter.ts and ingest.ts, which call it when they finish.
 */
import { config } from "dotenv";
import { asc, eq, sql } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb, schema } from "../src/db";

config({ path: ".env.local", quiet: true });

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export async function writeHiddenReview(path = "hidden-review.md") {
  const db = getDb();
  const rows = await db
    .select({ id: schema.artworks.id, title: schema.artworks.title, reason: schema.artworks.hiddenReason, url: schema.artworks.sourceUrl, museum: schema.artworks.source })
    .from(schema.artworks)
    .where(eq(schema.artworks.hidden, true))
    .orderBy(asc(schema.artworks.id));
  const [{ visible = 0 } = {}] = await db
    .select({ visible: sql<number>`count(*)::int` })
    .from(schema.artworks)
    .where(sql`${schema.artworks.collection} = 'china' and not ${schema.artworks.hidden}`);

  const kind = (r: { reason: string | null }) => (r.reason?.startsWith("keyword") ? "keyword" : r.reason?.startsWith("image") ? "image" : "other");
  const by = { keyword: rows.filter((r) => kind(r) === "keyword"), image: rows.filter((r) => kind(r) === "image"), other: rows.filter((r) => kind(r) === "other") };

  const table = (list: typeof rows) =>
    ["| id | title | reason |", "|---|---|---|", ...list.map((r) => `| [${r.id}](${r.url}) | ${esc(r.title)} | ${esc(r.reason ?? "")} |`)].join("\n");

  const out = [
    "# Hidden works: review list",
    "",
    "Works hidden by the content filter. They are ignored by every page and API, and their detail URLs return 404.",
    "The filter is deliberately conservative: when in doubt, it hides. Check this list; to bring a work back, set `hidden = false` on its row.",
    "",
    `- **Hidden: ${rows.length}** (keyword pass: ${by.keyword.length}, image pass: ${by.image.length}${by.other.length ? `, other: ${by.other.length}` : ""})`,
    `- **Still visible: ${visible}**`,
    `- Generated: ${new Date().toISOString()}`,
    "",
    `## Hidden by the keyword pass (${by.keyword.length})`,
    "",
    "Reason format: `keyword: <word> (<field>): \"…text around the match…\"`.",
    "",
    by.keyword.length ? table(by.keyword) : "_none_",
    "",
    `## Hidden by the image pass (${by.image.length})`,
    "",
    "Reason format: `image: <category> <score> (\"<closest label>\")` or `nsfw <score>`. Scores are probabilities from local models (CLIP zero-shot and an NSFW classifier).",
    "",
    by.image.length ? table(by.image) : "_none_",
    ...(by.other.length ? ["", `## Other (${by.other.length})`, "", table(by.other)] : []),
    "",
  ].join("\n");
  writeFileSync(path, out);
  return { hidden: rows.length, keyword: by.keyword.length, image: by.image.length, visible };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await writeHiddenReview();
  console.log("wrote hidden-review.md:", r);
}
