import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/errors";
import { resetRateLimits } from "@/lib/rate-limit";
import {
  MUTATIONS_PER_MINUTE, addToWall, createWall, deleteWall, removeFromWall, reorderWall, setLike, updateWall,
} from "@/lib/services/walls";
import { makeTestDb, seed } from "./helpers/db";

let db: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => {
  resetRateLimits();
  db = await makeTestDb();
  await seed(db);
});

const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof AppError ? e.code : `other:${e}`));
const mk = (uid = "alice", title = "Quiet Rooms") => createWall(db, uid, { title });
const order = async (wallId: string) =>
  (await db.select().from(schema.wallItems).where(eq(schema.wallItems.wallId, wallId)).orderBy(schema.wallItems.position)).map((r) => r.artworkId);

describe("authentication", () => {
  it("rejects every mutation when signed out", async () => {
    const wall = await mk();
    const calls = [
      createWall(db, null, { title: "x" }),
      updateWall(db, undefined, { wallId: wall.id, title: "y" }),
      deleteWall(db, null, { wallId: wall.id }),
      addToWall(db, null, { wallId: wall.id, artworkId: "aic:1" }),
      removeFromWall(db, null, { wallId: wall.id, artworkId: "aic:1" }),
      reorderWall(db, null, { wallId: wall.id, orderedArtworkIds: ["aic:1"] }),
      setLike(db, null, { artworkId: "aic:1" }, true),
    ];
    for (const c of calls) expect(await code(c)).toBe("UNAUTHENTICATED");
  });
});

describe("ownership", () => {
  it("lets other users neither read-modify nor delete a wall", async () => {
    const wall = await mk("alice");
    await addToWall(db, "alice", { wallId: wall.id, artworkId: "aic:1" });
    expect(await code(updateWall(db, "bob", { wallId: wall.id, title: "mine now" }))).toBe("FORBIDDEN");
    expect(await code(deleteWall(db, "bob", { wallId: wall.id }))).toBe("FORBIDDEN");
    expect(await code(addToWall(db, "bob", { wallId: wall.id, artworkId: "aic:2" }))).toBe("FORBIDDEN");
    expect(await code(removeFromWall(db, "bob", { wallId: wall.id, artworkId: "aic:1" }))).toBe("FORBIDDEN");
    expect(await code(reorderWall(db, "bob", { wallId: wall.id, orderedArtworkIds: ["aic:1"] }))).toBe("FORBIDDEN");
    const [still] = await db.select().from(schema.walls).where(eq(schema.walls.id, wall.id));
    expect(still?.title).toBe("Quiet Rooms");
    expect(await order(wall.id)).toEqual(["aic:1"]);
  });

  it("reports missing walls as NOT_FOUND", async () => {
    expect(await code(deleteWall(db, "alice", { wallId: crypto.randomUUID() }))).toBe("NOT_FOUND");
  });

  it("lets the owner update and delete", async () => {
    const wall = await mk();
    const upd = await updateWall(db, "alice", { wallId: wall.id, isPublic: true, theme: "night" });
    expect(upd).toMatchObject({ isPublic: true, theme: "night" });
    await deleteWall(db, "alice", { wallId: wall.id });
    expect(await db.select().from(schema.walls)).toHaveLength(0);
  });
});

describe("validation", () => {
  it("rejects bad input with INVALID", async () => {
    expect(await code(createWall(db, "alice", { title: "   " }))).toBe("INVALID");
    expect(await code(createWall(db, "alice", { title: "ok", theme: "neon" }))).toBe("INVALID");
    expect(await code(createWall(db, "alice", { title: "x".repeat(81) }))).toBe("INVALID");
    const wall = await mk();
    expect(await code(addToWall(db, "alice", { wallId: wall.id, artworkId: "not-an-id" }))).toBe("INVALID");
    expect(await code(addToWall(db, "alice", { wallId: "nope", artworkId: "aic:1" }))).toBe("INVALID");
    expect(await code(updateWall(db, "alice", { wallId: wall.id }))).toBe("INVALID");
  });

  it("rejects artwork that is not in the collection", async () => {
    const wall = await mk();
    expect(await code(addToWall(db, "alice", { wallId: wall.id, artworkId: "aic:999999" }))).toBe("NOT_FOUND");
    expect(await code(setLike(db, "alice", { artworkId: "met:1" }, true))).toBe("NOT_FOUND");
    // works outside the Chinese collection (the "legacy" row) cannot be hung or liked
    expect(await code(addToWall(db, "alice", { wallId: wall.id, artworkId: "aic:900" }))).toBe("NOT_FOUND");
    expect(await code(setLike(db, "alice", { artworkId: "aic:900" }, true))).toBe("NOT_FOUND");
    // ...and neither can works hidden by the content filter
    expect(await code(addToWall(db, "alice", { wallId: wall.id, artworkId: "aic:901" }))).toBe("NOT_FOUND");
    expect(await code(setLike(db, "alice", { artworkId: "aic:901" }, true))).toBe("NOT_FOUND");
  });
});

describe("wall contents", () => {
  it("creates URL-safe unique slugs", async () => {
    const a = await mk("alice", "Café Nights!");
    const b = await mk("alice", "Café Nights!");
    expect(a.slug).toMatch(/^cafe-nights-[a-z0-9]{4}$/);
    expect(a.slug).not.toBe(b.slug);
  });

  it("appends works in order and ignores duplicates", async () => {
    const wall = await mk();
    for (const id of ["aic:1", "aic:2", "aic:3"]) await addToWall(db, "alice", { wallId: wall.id, artworkId: id });
    const dup = await addToWall(db, "alice", { wallId: wall.id, artworkId: "aic:2" });
    expect(dup.added).toBe(false);
    expect(await order(wall.id)).toEqual(["aic:1", "aic:2", "aic:3"]);
  });

  it("reorders atomically and refuses a mismatched set", async () => {
    const wall = await mk();
    for (const id of ["aic:1", "aic:2", "aic:3"]) await addToWall(db, "alice", { wallId: wall.id, artworkId: id });
    await reorderWall(db, "alice", { wallId: wall.id, orderedArtworkIds: ["aic:3", "aic:1", "aic:2"] });
    expect(await order(wall.id)).toEqual(["aic:3", "aic:1", "aic:2"]);
    expect(await code(reorderWall(db, "alice", { wallId: wall.id, orderedArtworkIds: ["aic:3", "aic:1"] }))).toBe("INVALID");
    expect(await code(reorderWall(db, "alice", { wallId: wall.id, orderedArtworkIds: ["aic:3", "aic:1", "aic:4"] }))).toBe("INVALID");
    expect(await code(reorderWall(db, "alice", { wallId: wall.id, orderedArtworkIds: ["aic:3", "aic:3", "aic:1"] }))).toBe("INVALID");
    expect(await order(wall.id)).toEqual(["aic:3", "aic:1", "aic:2"]);
  });

  it("keeps reordering working after a work on the wall is hidden", async () => {
    const wall = await mk();
    for (const id of ["aic:1", "aic:2", "aic:3"]) await addToWall(db, "alice", { wallId: wall.id, artworkId: id });
    await db.update(schema.artworks).set({ hidden: true, hiddenReason: "keyword: test" }).where(eq(schema.artworks.id, "aic:2"));
    // the page only shows (and the client only sends) the two visible works
    await reorderWall(db, "alice", { wallId: wall.id, orderedArtworkIds: ["aic:3", "aic:1"] });
    const visibleOrder = (await order(wall.id)).filter((id) => id !== "aic:2");
    expect(visibleOrder).toEqual(["aic:3", "aic:1"]);
    // sending the hidden one is not allowed
    expect(await code(reorderWall(db, "alice", { wallId: wall.id, orderedArtworkIds: ["aic:3", "aic:2", "aic:1"] }))).toBe("INVALID");
  });

  it("removes works", async () => {
    const wall = await mk();
    await addToWall(db, "alice", { wallId: wall.id, artworkId: "aic:1" });
    await removeFromWall(db, "alice", { wallId: wall.id, artworkId: "aic:1" });
    expect(await order(wall.id)).toEqual([]);
  });

  it("cascades item deletion with the wall", async () => {
    const wall = await mk();
    await addToWall(db, "alice", { wallId: wall.id, artworkId: "aic:1" });
    await deleteWall(db, "alice", { wallId: wall.id });
    expect(await db.select().from(schema.wallItems)).toHaveLength(0);
  });
});

describe("likes", () => {
  it("is idempotent in both directions and per user", async () => {
    await setLike(db, "alice", { artworkId: "aic:1" }, true);
    await setLike(db, "alice", { artworkId: "aic:1" }, true);
    await setLike(db, "bob", { artworkId: "aic:1" }, true);
    expect(await db.select().from(schema.likes)).toHaveLength(2);
    await setLike(db, "alice", { artworkId: "aic:1" }, false);
    await setLike(db, "alice", { artworkId: "aic:1" }, false);
    const left = await db.select().from(schema.likes).where(and(eq(schema.likes.artworkId, "aic:1")));
    expect(left.map((l) => l.userId)).toEqual(["bob"]);
  });
});

describe("rate limiting", () => {
  it("blocks a user who exceeds the mutation budget, but not other users", async () => {
    const wall = await mk();
    let last = "ok";
    for (let i = 0; i < MUTATIONS_PER_MINUTE + 2; i++) {
      last = await code(updateWall(db, "alice", { wallId: wall.id, description: `d${i}` }));
    }
    expect(last).toBe("RATE_LIMITED");
    expect(await code(createWall(db, "bob", { title: "Bob's wall" }))).toBe("ok");
  });
});
