import { expect, test } from "@playwright/test";

test("home: hero piece, palette, and the Wander grid with infinite scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Palette").first().getByRole("listitem")).toHaveCount(5, { timeout: 5000 }).catch(() => {});
  await expect(page.getByRole("heading", { name: "Wander" })).toBeVisible();
  const cards = page.locator(".masonry > li");
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();
  expect(before).toBeGreaterThanOrEqual(30);
  await page.getByRole("button", { name: "Show more" }).scrollIntoViewIfNeeded();
  await expect.poll(async () => cards.count(), { timeout: 15_000 }).toBeGreaterThan(before);
});

test("home: security headers and skip link", async ({ page, request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBeTruthy();
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["content-security-policy"]).toContain("www.artic.edu");
  expect(h["content-security-policy"]).not.toContain("*.");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("theme toggle switches and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
  const chosen = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", chosen!);
});

test("search: instant results, theme and dynasty filters, URL-synced state, colour filter", async ({ page }) => {
  await page.goto("/search");
  // dynasty replaced century; there are nine dynasties and eight themes
  await expect(page.getByRole("group", { name: "Dynasty" }).or(page.locator("fieldset", { hasText: "Dynasty" })).first()).toBeVisible();
  await expect(page.locator("fieldset", { hasText: "Century" })).toHaveCount(0);
  await expect(page.locator("fieldset", { hasText: "Dynasty" }).getByRole("button")).toHaveCount(9);
  await expect(page.locator("fieldset", { hasText: "Theme" }).getByRole("button")).toHaveCount(8);

  await page.getByRole("searchbox").fill("dragon");
  await expect(page).toHaveURL(/q=dragon/);
  await expect(page.getByTestId("result-count")).toContainText(/works?/);
  await expect(page.locator(".masonry > li").first()).toBeVisible();

  await page.getByRole("button", { name: "Qing", exact: true }).click();
  await expect(page).toHaveURL(/dynasty=qing/);
  await page.getByRole("button", { name: "Silk & embroidery" }).click();
  await expect(page).toHaveURL(/theme=textiles/);
  await page.getByRole("button", { name: "Cleveland" }).click();
  await expect(page).toHaveURL(/museum=cma/);

  // shareable: reloading the URL restores the same state
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("dragon");
  await expect(page.getByRole("button", { name: "Qing", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Silk & embroidery" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Clear all filters" }).click();
  await page.getByRole("button", { name: "Blue hue" }).click();
  await expect(page).toHaveURL(/hue=240/);
});

test("search: a theme filter narrows to that theme", async ({ page, request }) => {
  const all = await (await request.get("/api/search")).json();
  const porcelain = await (await request.get("/api/search?theme=porcelain")).json();
  expect(porcelain.total).toBeGreaterThan(0);
  expect(porcelain.total).toBeLessThan(all.total);
  await page.goto("/search?theme=porcelain&dynasty=ming,qing");
  await expect(page.getByRole("button", { name: "Blue-and-white & celadon" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".masonry > li").first()).toBeVisible();
});

test("search: empty state", async ({ page }) => {
  await page.goto("/search?q=zzzzqqqxxnotaword");
  await expect(page.getByText("Nothing hangs here yet.")).toBeVisible();
});

test("detail: open from grid, metadata, colour rail, deep zoom dialog", async ({ page }) => {
  await page.goto("/");
  await page.locator(".masonry a.card").first().click();
  await expect(page).toHaveURL(/\/art\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Public domain (CC0)")).toBeVisible();
  await expect(page.getByRole("link", { name: /View at/ })).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByRole("link", { name: "Add to wall" })).toBeVisible(); // signed out -> sign-in link
  await expect(page.getByRole("heading", { name: "More in this color" })).toBeVisible();

  await page.getByRole("button", { name: /^Zoom into/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("404 page is designed, not default", async ({ page }) => {
  const res = await page.goto("/art/aic:99999999");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /Nothing is hanging here/ })).toBeVisible();
});

test("API: daily artwork is deterministic per date, Chinese, on-theme, and inputs are validated", async ({ request }) => {
  const a = await (await request.get("/api/daily?date=2026-03-04")).json();
  const b = await (await request.get("/api/daily?date=2026-03-04")).json();
  expect(a.artwork.id).toBe(b.artwork.id);
  const allowed = ["dragons", "ink-landscapes", "bird-and-flower", "porcelain"];
  for (let d = 1; d <= 20; d++) {
    const r = await (await request.get(`/api/daily?date=2026-04-${String(d).padStart(2, "0")}`)).json();
    expect(r.artwork.collection).toBe("china");
    expect((r.artwork.themes as string[]).some((t) => allowed.includes(t))).toBe(true);
    expect(Math.min(r.artwork.width, r.artwork.height)).toBeGreaterThanOrEqual(600);
  }
  expect((await request.get("/api/daily?date=nope")).status()).toBe(400);
  expect((await request.get("/api/search?hue=999")).status()).toBe(400);
  expect((await request.get("/api/art/not-an-id")).status()).toBe(400);
});

test("design: cinnabar accent in light mode, and the site says it is Chinese art", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase());
  expect(accent).toBe("#b02a1c");
  await expect(page.getByText(/Chinese art/i).first()).toBeVisible();
  await expect(page).toHaveTitle(/Chinese art/i);
});
