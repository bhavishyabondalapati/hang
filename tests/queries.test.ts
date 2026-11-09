import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { makeTestDb } from "./helpers/db";
import { DAILY_THEMES } from "@/lib/themes";
import { searchInput } from "@/lib/validation";

let db: Awaited<ReturnType<typeof makeTestDb>>;
vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const q = await import("@/lib/queries");

type Seed = { n: string; title: string; dynasty: string | null; themes: string[]; w?: number; h?: number; collection?: string; hue?: number; sat?: number; group?: string };
const works: Seed[] = [
  { n: "1", title: "Dragon Robe", dynasty: "qing", themes: ["dragons", "textiles"], w: 900, h: 1200, hue: 210, sat: 0.5 },
  { n: "2", title: "Nine Dragons Handscroll", dynasty: "song", themes: ["dragons"], w: 3000, h: 900, hue: 30, sat: 0.4, group: "Painting" },
  { n: "3", title: "Landscape after Ni Zan", dynasty: "yuan", themes: ["ink-landscapes"], w: 800, h: 1400, hue: 40, sat: 0.1 },
  { n: "4", title: "Celadon Vase", dynasty: "song", themes: ["porcelain"], w: 1000, h: 1000, hue: 150, sat: 0.3, group: "Ceramics" },
  { n: "5", title: "Jade Bi Disc", dynasty: "han", themes: ["jade"], w: 1200, h: 1200, hue: 120, sat: 0.3 },
  { n: "6", title: "Ritual Wine Vessel", dynasty: "shang", themes: ["bronzes"], w: 1200, h: 1200 },
  { n: "7", title: "Tiny Bird Painting", dynasty: "ming", themes: ["bird-and-flower"], w: 500, h: 520 }, // too small for the daily piece
  { n: "8", title: "Dragon Jar (hidden)", dynasty: "ming", themes: ["dragons", "porcelain"], w: 1500, h: 1500, collection: "legacy" },
];

beforeAll(async () => {
  db = await makeTestDb();
  await db.insert(schema.artworks).values(
    works.map((w) => ({
      id: `cma:${w.n}`, source: "cma" as const, nativeId: w.n, title: w.title, dynasty: w.dynasty, themes: w.themes,
      collection: w.collection ?? "china", width: w.w, height: w.h, hue: w.hue ?? 0, saturation: w.sat ?? 0, lightness: 0.5,
      mediumGroup: w.group ?? "Other", palette: ["#111111", "#777777", "#cccccc"], imageSmall: "s", imageMedium: "m", imageLarge: "l",
      museum: "Cleveland Museum of Art", sourceUrl: "u", shuffle: Number(w.n) / 10,
    })),
  );
});

const ids = (r: { items: Array<{ id: string }> }) => r.items.map((i) => i.id).sort();
const search = (raw: Record<string, string>) => q.searchArtworks(searchInput.parse(raw));

describe("search filters", () => {
  it("never returns works outside the Chinese collection", async () => {
    const all = await search({});
    expect(all.total).toBe(7);
    expect(ids(all)).not.toContain("cma:8");
    expect(ids(await search({ q: "dragon" }))).not.toContain("cma:8");
    expect(ids(await search({ theme: "porcelain" }))).toEqual(["cma:4"]);
  });
  it("filters by dynasty (one or several)", async () => {
    expect(ids(await search({ dynasty: "song" }))).toEqual(["cma:2", "cma:4"]);
    expect(ids(await search({ dynasty: "qing,han" }))).toEqual(["cma:1", "cma:5"]);
  });
  it("filters by theme and combines with dynasty", async () => {
    expect(ids(await search({ theme: "dragons" }))).toEqual(["cma:1", "cma:2"]);
    expect(ids(await search({ theme: "dragons,jade" }))).toEqual(["cma:1", "cma:2", "cma:5"]);
    expect(ids(await search({ theme: "dragons", dynasty: "song" }))).toEqual(["cma:2"]);
  });
  it("matches words by prefix while typing", async () => {
    expect(ids(await search({ q: "drag" }))).toEqual(["cma:1", "cma:2"]);
    expect(ids(await search({ q: "celad" }))).toEqual(["cma:4"]);
  });
  it("finds the nearest hue and ignores near-greys", async () => {
    expect(ids(await search({ hue: "210" }))).toEqual(["cma:1"]);
    expect(ids(await search({ hue: "40" }))).toEqual(["cma:2"]); // cma:3 is at hue 40 but nearly grey
  });
  it("rejects century (removed) silently and bad dynasty/theme values loudly", () => {
    expect(searchInput.safeParse({ century: "19" }).success).toBe(true);
    expect(searchInput.safeParse({ dynasty: "tokugawa" }).success).toBe(false);
    expect(searchInput.safeParse({ theme: "cats" }).success).toBe(false);
  });
});

describe("other read paths respect the same gate", () => {
  it("hides non-Chinese works from detail, feed and sitemap", async () => {
    expect(await q.getArtwork("cma:8")).toBeNull();
    expect((await q.getArtwork("cma:1"))?.title).toBe("Dragon Robe");
    const feed = await q.wander(null, 50);
    expect(feed.items.map((i) => i.id)).not.toContain("cma:8");
    expect((await q.sitemapEntries()).art).not.toContain("cma:8");
  });
});

describe("today's piece", () => {
  it("only draws from dragons, landscapes, bird-and-flower and porcelain, with a good image size", async () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const a = await q.dailyArtwork(`2026-02-${String(d).padStart(2, "0")}`);
      expect(a).not.toBeNull();
      seen.add(a!.id);
      expect(a!.collection).toBe("china");
      expect(a!.themes.some((t) => DAILY_THEMES.includes(t as never))).toBe(true);
      expect(Math.min(a!.width!, a!.height!)).toBeGreaterThanOrEqual(600);
    }
    // never the jade disc, the bronze, the tiny bird painting, or the hidden dragon jar
    for (const bad of ["cma:5", "cma:6", "cma:7", "cma:8"]) expect(seen.has(bad)).toBe(false);
    expect(seen.size).toBeGreaterThan(1); // it does vary by date
  });
  it("is deterministic for a given date", async () => {
    expect((await q.dailyArtwork("2026-03-04"))?.id).toBe((await q.dailyArtwork("2026-03-04"))?.id);
  });
});
