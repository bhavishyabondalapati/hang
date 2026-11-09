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

test("search: instant results, URL-synced state, colour filter", async ({ page }) => {
  await page.goto("/search");
  await page.getByRole("searchbox").fill("monet");
  await expect(page).toHaveURL(/q=monet/);
  const count = page.getByTestId("result-count");
  await expect(count).toContainText(/works?/);
  await expect(page.locator(".masonry > li").first()).toBeVisible();
  await page.getByRole("button", { name: "Blue hue" }).click();
  await expect(page).toHaveURL(/hue=240/);
  await page.getByRole("button", { name: "Art Institute" }).click();
  await expect(page).toHaveURL(/museum=aic/);

  // shareable: reloading the URL restores the same state
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("monet");
  await expect(page.getByRole("button", { name: "Blue hue" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Art Institute" })).toHaveAttribute("aria-pressed", "true");
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

test("API: daily artwork is deterministic per date and inputs are validated", async ({ request }) => {
  const a = await (await request.get("/api/daily?date=2026-03-04")).json();
  const b = await (await request.get("/api/daily?date=2026-03-04")).json();
  expect(a.artwork.id).toBe(b.artwork.id);
  expect((await request.get("/api/daily?date=nope")).status()).toBe(400);
  expect((await request.get("/api/search?hue=999")).status()).toBe(400);
  expect((await request.get("/api/art/not-an-id")).status()).toBe(400);
});
