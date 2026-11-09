/**
 * Screenshots every page, light + dark, mobile + desktop.
 *   BASE_URL=http://localhost:3100 npm run screenshots -- pass1
 * The server must be started with E2E_AUTH=1 so the test sign-in route exists.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const pass = process.argv[2] ?? "pass";
const out = `screenshots/${pass}`;
mkdirSync(out, { recursive: true });

const sizes = [
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];
const schemes = ["light", "dark"] as const;

const browser = await chromium.launch();
const seed = await browser.newContext({ baseURL: base });
await seed.request.post("/api/test/sign-in", { data: { key: "shots", name: "Mara Okafor" } });
const wander = (await (await seed.request.get("/api/wander")).json()) as { items: Array<{ id: string }> };
const ids = wander.items.map((i) => i.id);
const wall = await (await seed.request.post("/api/walls", { data: { title: "Blue hour, mostly", description: "Quiet rooms and late light.", isPublic: true, theme: "plaster" } })).json();
for (const id of ids.slice(0, 7)) await seed.request.post(`/api/walls/${wall.id}/items`, { data: { artworkId: id } });
const storage = await seed.storageState();
await seed.close();

const pages: Array<{ name: string; path: string; auth?: boolean; wait?: string }> = [
  { name: "home", path: "/" },
  { name: "search", path: "/search" },
  { name: "search-color", path: "/search?hue=210&museum=aic,cma" },
  { name: "art", path: `/art/${ids[3]}` },
  { name: "art-cma", path: `/art/${ids.find((i) => i.startsWith("cma:"))}` },
  { name: "wall-public", path: `/walls/${wall.slug}` },
  { name: "wall-owner", path: `/walls/${wall.slug}`, auth: true },
  { name: "me", path: "/me", auth: true },
  { name: "signin", path: "/signin" },
  { name: "404", path: "/nope-nothing-here" },
];

for (const size of sizes) {
  for (const scheme of schemes) {
    for (const auth of [false, true]) {
      const ctx = await browser.newContext({
        baseURL: base, viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile,
        colorScheme: scheme, storageState: auth ? storage : undefined, deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      for (const p of pages.filter((x) => !!x.auth === auth)) {
        await page.goto(p.path, { waitUntil: "networkidle" }).catch(() => {});
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${out}/${p.name}-${size.name}-${scheme}.png`, fullPage: p.name !== "art" && p.name !== "art-cma" });
        console.log("shot", p.name, size.name, scheme);
      }
      await ctx.close();
    }
  }
}
await browser.close();
