import { and, count, eq, max, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { AppError } from "../errors";
import { rateLimit } from "../rate-limit";
import { uniqueSlug } from "../slug";
import { createWallInput, likeInput, reorderInput, updateWallInput, wallIdInput, wallItemInput } from "../validation";
import type { ZodType } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = PgDatabase<any, typeof schema>;

export const MAX_WALLS_PER_USER = 50;
export const MAX_ITEMS_PER_WALL = 200;
export const MUTATIONS_PER_MINUTE = 40;

const { walls, wallItems, likes, artworks } = schema;

function parse<T>(schemaDef: ZodType<T>, raw: unknown): T {
  const r = schemaDef.safeParse(raw);
  if (!r.success) {
    const fields = r.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    throw new AppError("INVALID", r.error.issues[0]?.message ?? "Invalid input", fields);
  }
  return r.data;
}

/** Common gate for every mutation: must be signed in, and not hammering the API. */
function gate(userId: string | null | undefined): string {
  if (!userId) throw new AppError("UNAUTHENTICATED", "Sign in to do that.");
  const rl = rateLimit(`mut:${userId}`, MUTATIONS_PER_MINUTE);
  if (!rl.ok) throw new AppError("RATE_LIMITED", `Slow down a little and try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.`);
  return userId;
}

/** Load a wall and prove the caller owns it. */
async function ownedWall(db: AnyDb, userId: string, wallId: string) {
  const [wall] = await db.select().from(walls).where(eq(walls.id, wallId)).limit(1);
  if (!wall) throw new AppError("NOT_FOUND", "That wall doesn't exist.");
  if (wall.userId !== userId) throw new AppError("FORBIDDEN", "You can only change your own walls.");
  return wall;
}

export async function createWall(db: AnyDb, userId: string | null | undefined, raw: unknown) {
  const uid = gate(userId);
  const input = parse(createWallInput, raw);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(walls).where(eq(walls.userId, uid));
  if (n >= MAX_WALLS_PER_USER) throw new AppError("LIMIT", `You can have up to ${MAX_WALLS_PER_USER} walls.`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [row] = await db.insert(walls).values({ ...input, userId: uid, slug: uniqueSlug(input.title) }).returning();
      return row!;
    } catch (e) {
      if (attempt === 2 || !/unique|duplicate/i.test(String((e as Error).message) + String((e as { cause?: Error }).cause?.message))) throw e;
    }
  }
  throw new AppError("CONFLICT", "Could not create wall.");
}

export async function updateWall(db: AnyDb, userId: string | null | undefined, raw: unknown) {
  const uid = gate(userId);
  const { wallId, ...patch } = parse(updateWallInput, raw);
  await ownedWall(db, uid, wallId);
  const [row] = await db.update(walls).set({ ...patch, updatedAt: new Date() }).where(and(eq(walls.id, wallId), eq(walls.userId, uid))).returning();
  return row!;
}

export async function deleteWall(db: AnyDb, userId: string | null | undefined, raw: unknown) {
  const uid = gate(userId);
  const { wallId } = parse(wallIdInput, raw);
  const wall = await ownedWall(db, uid, wallId);
  await db.delete(walls).where(and(eq(walls.id, wallId), eq(walls.userId, uid)));
  return wall;
}

export async function addToWall(db: AnyDb, userId: string | null | undefined, raw: unknown) {
  const uid = gate(userId);
  const { wallId, artworkId } = parse(wallItemInput, raw);
  const wall = await ownedWall(db, uid, wallId);
  const [art] = await db.select({ id: artworks.id }).from(artworks).where(eq(artworks.id, artworkId)).limit(1);
  if (!art) throw new AppError("NOT_FOUND", "That artwork isn't in the collection.");
  const [stats] = await db.select({ n: count(), top: max(wallItems.position) }).from(wallItems).where(eq(wallItems.wallId, wallId));
  if ((stats?.n ?? 0) >= MAX_ITEMS_PER_WALL) throw new AppError("LIMIT", `A wall holds up to ${MAX_ITEMS_PER_WALL} works.`);
  const inserted = await db
    .insert(wallItems)
    .values({ wallId, artworkId, position: (stats?.top ?? -1) + 1 })
    .onConflictDoNothing()
    .returning({ id: wallItems.id });
  await db.update(walls).set({ updatedAt: new Date() }).where(eq(walls.id, wallId));
  return { wall, added: inserted.length > 0 };
}

export async function removeFromWall(db: AnyDb, userId: string | null | undefined, raw: unknown) {
  const uid = gate(userId);
  const { wallId, artworkId } = parse(wallItemInput, raw);
  const wall = await ownedWall(db, uid, wallId);
  await db.delete(wallItems).where(and(eq(wallItems.wallId, wallId), eq(wallItems.artworkId, artworkId)));
  await db.update(walls).set({ updatedAt: new Date() }).where(eq(walls.id, wallId));
  return wall;
}

/** The new order must be exactly the wall's current set of works, just rearranged. */
export async function reorderWall(db: AnyDb, userId: string | null | undefined, raw: unknown) {
  const uid = gate(userId);
  const { wallId, orderedArtworkIds } = parse(reorderInput, raw);
  const wall = await ownedWall(db, uid, wallId);
  const current = await db.select({ id: wallItems.artworkId }).from(wallItems).where(eq(wallItems.wallId, wallId));
  const want = new Set(orderedArtworkIds);
  if (want.size !== orderedArtworkIds.length || want.size !== current.length || current.some((c) => !want.has(c.id))) {
    throw new AppError("INVALID", "The new order doesn't match the works on this wall.");
  }
  const values = sql.join(orderedArtworkIds.map((id, i) => sql`(${id}, ${i}::int)`), sql`, `);
  // One statement, so the reorder is atomic.
  await db.execute(sql`
    update wall_items set position = v.pos
    from (values ${values}) as v(artwork_id, pos)
    where wall_items.wall_id = ${wallId} and wall_items.artwork_id = v.artwork_id`);
  await db.update(walls).set({ updatedAt: new Date() }).where(eq(walls.id, wallId));
  return wall;
}

export async function setLike(db: AnyDb, userId: string | null | undefined, raw: unknown, liked: boolean) {
  const uid = gate(userId);
  const { artworkId } = parse(likeInput, raw);
  if (liked) {
    const [art] = await db.select({ id: artworks.id }).from(artworks).where(eq(artworks.id, artworkId)).limit(1);
    if (!art) throw new AppError("NOT_FOUND", "That artwork isn't in the collection.");
    await db.insert(likes).values({ userId: uid, artworkId }).onConflictDoNothing();
  } else {
    await db.delete(likes).where(and(eq(likes.userId, uid), eq(likes.artworkId, artworkId)));
  }
  return { artworkId, liked };
}
