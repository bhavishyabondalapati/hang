import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seed } from "./helpers/db";
import { resetRateLimits } from "@/lib/rate-limit";

let db: Awaited<ReturnType<typeof makeTestDb>>;
let currentUser: string | undefined;

vi.mock("@/auth", () => ({ auth: async () => (currentUser ? { user: { id: currentUser } } : null) }));
vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const actions = await import("@/app/actions");

beforeEach(async () => {
  resetRateLimits();
  db = await makeTestDb();
  await seed(db);
  currentUser = undefined;
});

describe("server actions", () => {
  it("returns UNAUTHENTICATED instead of throwing when signed out", async () => {
    const r = await actions.createWallAction({ title: "Nope" });
    expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("creates, fills and reorders a wall for a signed-in user", async () => {
    currentUser = "alice";
    const created = await actions.createWallAction({ title: "Blue Hour", isPublic: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const wallId = created.data.id;
    await actions.addToWallAction({ wallId, artworkId: "aic:1" });
    await actions.addToWallAction({ wallId, artworkId: "aic:2" });
    const r = await actions.reorderWallAction({ wallId, orderedArtworkIds: ["aic:2", "aic:1"] });
    expect(r.ok).toBe(true);
  });

  it("blocks a different user from editing someone else's wall", async () => {
    currentUser = "alice";
    const created = await actions.createWallAction({ title: "Mine" });
    if (!created.ok) throw new Error("setup failed");
    currentUser = "bob";
    const r = await actions.updateWallAction({ wallId: created.data.id, title: "Stolen" });
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const d = await actions.deleteWallAction({ wallId: created.data.id });
    expect(d).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("surfaces field errors for invalid input", async () => {
    currentUser = "alice";
    const r = await actions.createWallAction({ title: "" });
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("likes and unlikes", async () => {
    currentUser = "alice";
    expect(await actions.setLikeAction({ artworkId: "aic:1" }, true)).toMatchObject({ ok: true, data: { liked: true } });
    expect(await actions.setLikeAction({ artworkId: "aic:1" }, false)).toMatchObject({ ok: true, data: { liked: false } });
  });
});
