import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Mocked sign-in: creates a real user + DB session and sets the Auth.js cookie. */
export async function signIn(page: Page, key = `e2e${Date.now().toString(36)}`, name = "Test Curator") {
  const res = await page.request.post("/api/test/sign-in", { data: { key, name } });
  expect(res.ok()).toBeTruthy();
  return key;
}

export async function deleteWall(request: APIRequestContext, wallId: string) {
  await request.delete(`/api/walls/${wallId}`);
}

export async function firstArtworkIds(request: APIRequestContext, n: number) {
  const r = await (await request.get("/api/wander")).json();
  return (r.items as Array<{ id: string }>).slice(0, n).map((i) => i.id);
}
