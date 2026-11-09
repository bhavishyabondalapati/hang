import { neon } from "@neondatabase/serverless";
import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { screenText } from "../src/lib/content-filter";
import { deleteWall, firstArtworkIds, signIn } from "./helpers";

config({ path: ".env.local", quiet: true });
const sql = () => neon(process.env.DATABASE_URL!);

type Hidden = { id: string; title: string; hidden_reason: string };
async function hiddenWorks(limit = 40): Promise<Hidden[]> {
  const rows = (await sql()`select id, title, hidden_reason from artworks where hidden and collection = 'china' order by id limit ${limit}`) as Hidden[];
  return rows;
}

test.describe("content filter: hidden works", () => {
  test("there are hidden works to test with, and each has a reason", async () => {
    const h = await hiddenWorks();
    expect(h.length).toBeGreaterThan(0);
    for (const w of h) expect(w.hidden_reason).toMatch(/^(keyword|image):/);
  });

  test("a hidden work's detail URL is a 404 (page and API)", async ({ page, request }) => {
    for (const w of (await hiddenWorks(6))) {
      const res = await page.goto(`/art/${w.id}`);
      expect(res?.status(), w.id).toBe(404);
      await expect(page.getByRole("heading", { name: /Nothing is hanging here/ })).toBeVisible();
      expect((await request.get(`/api/art/${encodeURIComponent(w.id)}`)).status(), w.id).toBe(404);
    }
  });

  test("hidden works never show up in search, Wander, the sitemap or today's piece", async ({ request }) => {
    const hidden = await hiddenWorks(40);
    const hiddenIds = new Set(hidden.map((h) => h.id));

    // search by each hidden work's own title words, with and without filters
    for (const w of hidden.slice(0, 15)) {
      const words = w.title.split(/\s+/).filter((x) => x.length > 3).slice(0, 3).join(" ");
      if (!words) continue;
      for (const extra of ["", "&theme=dragons", "&dynasty=qing,ming"]) {
        const r = await (await request.get(`/api/search?q=${encodeURIComponent(words)}${extra}`)).json();
        for (const it of r.items as Array<{ id: string }>) expect(hiddenIds.has(it.id), `${it.id} for "${words}"`).toBe(false);
      }
    }

    // Wander: walk the first several pages
    let cursor: string | null = null;
    for (let i = 0; i < 8; i++) {
      const r = (await (await request.get(`/api/wander${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)).json()) as { items: Array<{ id: string }>; nextCursor: string | null };
      for (const it of r.items) expect(hiddenIds.has(it.id), it.id).toBe(false);
      cursor = r.nextCursor;
      if (!cursor) break;
    }

    // sitemap
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const id of hiddenIds) expect(sitemap.includes(`/art/${id}<`), id).toBe(false);

    // today's piece, every day for two months
    for (let d = 0; d < 60; d++) {
      const date = new Date(Date.UTC(2026, 5, 1 + d)).toISOString().slice(0, 10);
      const r = await (await request.get(`/api/daily?date=${date}`)).json();
      expect(hiddenIds.has(r.artwork.id), `${date} ${r.artwork.id}`).toBe(false);
      expect(r.artwork.hidden).toBe(false);
    }
  });

  test("no visible result has a title the keyword filter would hide", async ({ request }) => {
    for (const q of ["tomb", "warrior", "battle", "monster", "burial", "funerary", "war", "death", "demon", "ghost", "skull", "dragon", "landscape"]) {
      const r = await (await request.get(`/api/search?q=${q}`)).json();
      for (const it of r.items as Array<{ id: string; title: string }>) expect(screenText({ title: it.title }).hidden, `${it.id} "${it.title}" for q=${q}`).toBe(false);
    }
  });

  test("walls ignore hidden works, and hidden works cannot be added or liked", async ({ page, browser }) => {
    await signIn(page);
    const [hidden] = await hiddenWorks(1);
    const [visibleId] = await firstArtworkIds(page.request, 1);
    const created = await (await page.request.post("/api/walls", { data: { title: "Filter Check", isPublic: true } })).json();

    // cannot add or like a hidden work through the API
    const add = await page.request.post(`/api/walls/${created.id}/items`, { data: { artworkId: hidden!.id } });
    expect(add.status()).toBe(404);
    const like = await page.request.put(`/api/art/${encodeURIComponent(hidden!.id)}/like`);
    expect(like.status()).toBe(404);

    // a work hung before it was hidden: put the row in directly, as the filter would leave it
    expect((await page.request.post(`/api/walls/${created.id}/items`, { data: { artworkId: visibleId } })).status()).toBe(201);
    await sql()`insert into wall_items (wall_id, artwork_id, position) values (${created.id}, ${hidden!.id}, 99)`;

    const anon = await browser.newContext();
    const ap = await anon.newPage();
    const res = await ap.goto(`/walls/${created.slug}`);
    expect(res?.status()).toBe(200);
    await expect(ap.locator("ul[aria-label='Artworks on this wall'] > li")).toHaveCount(1);
    await expect(ap.getByText(hidden!.title, { exact: true })).toHaveCount(0);
    expect((await anon.request.get(`/walls/${created.slug}/opengraph-image`)).status()).toBe(200);
    await anon.close();

    // the owner's page and their "My walls" count also ignore it
    await page.goto("/me");
    await expect(page.getByRole("link", { name: /Filter Check, 1 works?/ })).toBeVisible();

    await deleteWall(page.request, created.id);
  });
});
