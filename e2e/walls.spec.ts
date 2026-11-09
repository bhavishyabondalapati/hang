import { expect, test } from "@playwright/test";
import { deleteWall, firstArtworkIds, signIn } from "./helpers";

test("signed out: /me redirects to sign in, mutations are rejected", async ({ page, request }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  const r = await request.post("/api/walls", { data: { title: "nope" } });
  expect(r.status()).toBe(401);
});

test("sign in (mocked), create a wall, add art, reorder, share publicly", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Test", exact: false }).first()).toBeVisible(); // header shows the user

  // create
  await page.goto("/me");
  await page.getByTestId("new-wall").click();
  await page.getByLabel("Title").fill("E2E Salon");
  await page.getByLabel("Description (optional)").fill("Hung by a test.");
  await page.getByRole("button", { name: "Night" }).click();
  await page.getByRole("button", { name: "Create wall" }).click();
  await expect(page).toHaveURL(/\/walls\/e2e-salon-/);
  const slug = page.url().split("/walls/")[1]!;
  await expect(page.getByRole("heading", { level: 1, name: "E2E Salon" })).toBeVisible();
  await expect(page.getByTestId("seal")).toBeVisible(); // the small red seal beside the placard title
  await expect(page.getByText("An empty wall, waiting.")).toBeVisible();

  // add three works through the real "Add to wall" UI on detail pages
  const ids = await firstArtworkIds(page.request, 3);
  for (const id of ids) {
    await page.goto(`/art/${id}`);
    await page.getByRole("button", { name: "Add to wall" }).click();
    await page.getByRole("button", { name: /E2E Salon/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added to E2E Salon." })).toBeVisible();
  }

  // reorder with the keyboard-accessible buttons: move the first work later
  await page.goto(`/walls/${slug}`);
  const titles = async () => page.locator("ul[aria-label^='Artworks on this wall'] > li .display").allInnerTexts();
  const before = await titles();
  expect(before).toHaveLength(3);
  await page.getByRole("button", { name: `Move ${before[0]} later` }).click();
  await expect(page.getByRole("status").filter({ hasText: "position 2 of 3" })).toBeVisible();
  const after = await titles();
  expect(after[1]).toBe(before[0]);
  await page.waitForTimeout(500);
  await page.reload();
  expect(await titles()).toEqual(after); // persisted

  // theme + publish
  await page.getByRole("radio", { name: "Gallery white" }).click();
  await expect(page.locator(".wall")).toHaveAttribute("data-theme", "gallery-white");
  // a wall made through the form starts public: flip to private and back to prove the toggle persists
  await page.getByRole("button", { name: "Public", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "now private" })).toBeVisible();
  await page.getByRole("button", { name: "Private", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "now public" })).toBeVisible();

  // anonymous visitor: public wall renders, with no owner controls
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  const res = await ap.goto(`/walls/${slug}`);
  expect(res?.status()).toBe(200);
  await expect(ap.getByRole("heading", { level: 1, name: "E2E Salon" })).toBeVisible();
  await expect(ap.locator("ul[aria-label='Artworks on this wall'] > li")).toHaveCount(3);
  await expect(ap.getByRole("button", { name: "Delete wall" })).toHaveCount(0);
  const og = await anon.request.get(`/walls/${slug}/opengraph-image`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
  await anon.close();

  // cleanup through the UI (also exercises delete)
  await page.getByRole("button", { name: "Delete wall" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/me$/);
});

test("private walls are hidden from everyone but the owner; others cannot edit", async ({ page, browser }) => {
  await signIn(page, `owner${Date.now().toString(36)}`);
  const created = await page.request.post("/api/walls", { data: { title: "Private Study", isPublic: false } });
  expect(created.status()).toBe(201);
  const wall = await created.json();

  const anon = await browser.newContext();
  const r = await anon.newPage().then((p) => p.goto(`/walls/${wall.slug}`));
  expect(r?.status()).toBe(404);

  // a different signed-in user cannot modify it
  const other = await browser.newContext();
  const op = await other.newPage();
  await signIn(op, `other${Date.now().toString(36)}`);
  const patch = await op.request.patch(`/api/walls/${wall.id}`, { data: { title: "Hijacked" } });
  expect(patch.status()).toBe(403);
  const del = await op.request.delete(`/api/walls/${wall.id}`);
  expect(del.status()).toBe(403);
  const [id] = await firstArtworkIds(op.request, 1);
  const add = await op.request.post(`/api/walls/${wall.id}/items`, { data: { artworkId: id } });
  expect(add.status()).toBe(403);
  const bad = await op.request.post(`/api/walls`, { data: { title: "", theme: "neon" } });
  expect(bad.status()).toBe(400);
  await other.close();
  await anon.close();

  await deleteWall(page.request, wall.id);
});

test("like toggles on the artwork page", async ({ page }) => {
  await signIn(page);
  const [id] = await firstArtworkIds(page.request, 1);
  await page.goto(`/art/${id}`);
  const like = page.getByRole("button", { name: /^Like/ });
  await expect(like).toBeEnabled();
  await like.click();
  await expect(page.getByRole("button", { name: /^Liked/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Liked/ }).click();
  await expect(page.getByRole("button", { name: /^Like/ })).toHaveAttribute("aria-pressed", "false");
});
