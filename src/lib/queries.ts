import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import type { Source } from "./artwork";
import { DAILY_THEMES } from "./themes";
import { isVisible } from "./visibility";
import { hash01 } from "./retry";
import type { SearchInput } from "./validation";

const { artworks, walls, wallItems, likes, users } = schema;

export const PAGE_SIZE = 36;
export const CACHE_TAG = "artworks";
/** Minimum saturation for an artwork to take part in hue search. */
export const MIN_CHROMA = 0.15;
/** Hue window (degrees either side) used by colour search. */
export const HUE_WINDOW = 22;

export type ArtCard = {
  id: string;
  source: Source;
  title: string;
  artist: string | null;
  date: string | null;
  imageSmall: string;
  imageMedium: string;
  width: number | null;
  height: number | null;
  dominantColor: string | null;
  museum: string;
};

const cardCols = {
  id: artworks.id,
  source: artworks.source,
  title: artworks.title,
  artist: artworks.artist,
  date: artworks.date,
  imageSmall: artworks.imageSmall,
  imageMedium: artworks.imageMedium,
  width: artworks.width,
  height: artworks.height,
  dominantColor: artworks.dominantColor,
  museum: artworks.museum,
};

/**
 * Visibility gate applied to every read path (search, feeds, detail, daily piece, rails, walls, sitemap, likes).
 * Only works that passed ingestion (CC0 / public domain, Chinese art, usable image) are in the "china" collection,
 * and the content filter's `hidden` flag removes the rest; see src/lib/visibility.ts.
 */
const visible = isVisible;

const cached = <A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string, revalidate = 3600) =>
  unstable_cache(fn, [key], { tags: [CACHE_TAG], revalidate });

/** "van gogh" -> "van:* & gogh:*" so results appear while typing. Only letters/digits survive. */
export function toPrefixQuery(q: string): string | null {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return tokens?.length ? tokens.slice(0, 8).map((t) => `${t}:*`).join(" & ") : null;
}

const hueDist = (h: number) => sql<number>`least(abs(${artworks.hue} - ${h}), 360 - abs(${artworks.hue} - ${h}))`;

async function searchImpl(input: SearchInput) {
  const db = getDb();
  const where: SQL[] = [visible()];
  const tsq = input.q ? toPrefixQuery(input.q) : null;
  if (tsq) where.push(sql`${artworks.search} @@ to_tsquery('english', ${tsq})`);
  if (input.museum?.length) where.push(inArray(artworks.source, input.museum));
  if (input.medium?.length) where.push(inArray(artworks.mediumGroup, input.medium));
  if (input.dynasty?.length) where.push(inArray(artworks.dynasty, input.dynasty));
  if (input.theme?.length) where.push(sql`${artworks.themes} && ARRAY[${sql.join(input.theme.map((t) => sql`${t}`), sql`, `)}]::text[]`);
  if (input.orientation) where.push(eq(artworks.orientation, input.orientation));
  if (input.hue !== undefined) {
    where.push(sql`${artworks.saturation} >= ${MIN_CHROMA}`);
    where.push(sql`${hueDist(input.hue)} <= ${HUE_WINDOW}`);
  }
  const cond = where.length ? and(...where) : undefined;
  const order: SQL[] = tsq
    ? [sql`ts_rank_cd(${artworks.search}, to_tsquery('english', ${tsq})) desc`, asc(artworks.id)]
    : input.hue !== undefined
      ? [sql`${hueDist(input.hue)} asc`, desc(artworks.saturation), asc(artworks.id)]
      : [asc(artworks.shuffle), asc(artworks.id)];

  const [rows, [totalRow]] = await Promise.all([
    db.select(cardCols).from(artworks).where(cond).orderBy(...order).limit(PAGE_SIZE).offset((input.page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(artworks).where(cond),
  ]);
  const total = totalRow?.n ?? 0;
  return { items: rows as ArtCard[], total, page: input.page, hasMore: input.page * PAGE_SIZE < total };
}

/** Cached for an hour; the key is the serialised filter set. */
export function searchArtworks(input: SearchInput) {
  return cached(searchImpl, "search")(input);
}

export async function wander(cursor: string | null, limit = PAGE_SIZE) {
  const run = async (cur: string | null, lim: number) => {
    const db = getDb();
    let cond: SQL | undefined;
    if (cur) {
      const [s, id] = cur.split("|");
      if (s && id && Number.isFinite(Number(s))) cond = sql`(${artworks.shuffle}, ${artworks.id}) > (${Number(s)}, ${id})`;
    }
    const rows = await db
      .select({ ...cardCols, shuffle: artworks.shuffle })
      .from(artworks)
      .where(cond ? and(visible(), cond) : visible())
      .orderBy(asc(artworks.shuffle), asc(artworks.id))
      .limit(lim + 1);
    const more = rows.length > lim;
    const items = rows.slice(0, lim);
    const last = items.at(-1);
    return {
      items: items.map(({ shuffle: _s, ...c }) => c as ArtCard),
      nextCursor: more && last ? `${last.shuffle}|${last.id}` : null,
    };
  };
  return cached(run, "wander")(cursor, limit);
}

export async function getArtwork(id: string) {
  const run = async (artId: string) => {
    const [row] = await getDb().select().from(artworks).where(and(eq(artworks.id, artId), visible())).limit(1);
    return row ?? null;
  };
  return cached(run, "artwork")(id);
}

export async function moreInColor(id: string, limit = 14) {
  const run = async (artId: string, lim: number) => {
    const db = getDb();
    const [a] = await db.select({ hue: artworks.hue, s: artworks.saturation, l: artworks.lightness }).from(artworks).where(and(eq(artworks.id, artId), visible()));
    if (!a || a.hue == null || a.l == null) return [] as ArtCard[];
    const chromatic = (a.s ?? 0) >= MIN_CHROMA;
    const cond = chromatic
      ? and(visible(), ne(artworks.id, artId), sql`${artworks.saturation} >= ${MIN_CHROMA}`, sql`${hueDist(a.hue)} <= 30`)
      : and(visible(), ne(artworks.id, artId), sql`${artworks.saturation} < ${MIN_CHROMA}`);
    // Closest in hue first, nudged by lightness so rails feel tonally consistent.
    const closeness = chromatic ? sql`${hueDist(a.hue)} + abs(${artworks.lightness} - ${a.l}) * 40` : sql`abs(${artworks.lightness} - ${a.l})`;
    return (await db.select(cardCols).from(artworks).where(cond).orderBy(closeness, asc(artworks.id)).limit(lim)) as ArtCard[];
  };
  return cached(run, "more-in-color")(id, limit);
}

/**
 * Deterministic piece of the day: a hash of the date picks an index into a stable, hero-worthy set.
 * Eligible: dragon works (robes, paintings, jars), ink landscapes, bird-and-flower paintings and porcelain,
 * with a good image size, and only works that pass the visibility gate.
 */
export const dailyEligible = () =>
  and(
    visible(),
    sql`${artworks.themes} && ARRAY[${sql.join(DAILY_THEMES.map((t) => sql`${t}`), sql`, `)}]::text[]`,
    sql`least(${artworks.width}, ${artworks.height}) >= 600`,
    sql`array_length(${artworks.palette}, 1) >= 3`,
  );

export async function dailyArtwork(date: string) {
  const run = async (d: string) => {
    const db = getDb();
    const eligible = dailyEligible();
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(artworks).where(eligible);
    if (!n) return null;
    const idx = Math.floor(hash01(`daily:${d}`) * n);
    const [row] = await db.select().from(artworks).where(eligible).orderBy(asc(artworks.shuffle), asc(artworks.id)).limit(1).offset(idx);
    return row ?? null;
  };
  return cached(run, "daily", 3600)(date);
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);

/* ---------------- walls & per-user reads (never cached: they depend on the viewer) ---------------- */

export async function getWallBySlug(slug: string, viewerId: string | null | undefined) {
  const db = getDb();
  const [row] = await db
    .select({ wall: walls, owner: { id: users.id, name: users.name, image: users.image } })
    .from(walls)
    .innerJoin(users, eq(users.id, walls.userId))
    .where(eq(walls.slug, slug))
    .limit(1);
  if (!row) return null;
  const isOwner = !!viewerId && row.wall.userId === viewerId;
  if (!row.wall.isPublic && !isOwner) return null;
  const items = (await db
    .select({ ...cardCols, position: wallItems.position, imageLarge: artworks.imageLarge })
    .from(wallItems)
    .innerJoin(artworks, eq(artworks.id, wallItems.artworkId))
    .where(and(eq(wallItems.wallId, row.wall.id), visible()))
    .orderBy(asc(wallItems.position), asc(wallItems.addedAt))) as Array<ArtCard & { position: number; imageLarge: string }>;
  return { wall: row.wall, owner: row.owner, items, isOwner };
}

export async function listMyWalls(userId: string) {
  const db = getDb();
  const mine = await db.select().from(walls).where(eq(walls.userId, userId)).orderBy(desc(walls.updatedAt));
  if (!mine.length) return [];
  const items = await db
    .select({ wallId: wallItems.wallId, position: wallItems.position, id: artworks.id, title: artworks.title, imageSmall: artworks.imageSmall, color: artworks.dominantColor })
    .from(wallItems)
    .innerJoin(artworks, eq(artworks.id, wallItems.artworkId))
    .where(and(inArray(wallItems.wallId, mine.map((w) => w.id)), visible()))
    .orderBy(asc(wallItems.position));
  return mine.map((w) => {
    const own = items.filter((i) => i.wallId === w.id);
    return { ...w, count: own.length, previews: own.slice(0, 4) };
  });
}

export async function listMyLikes(userId: string) {
  return (await getDb()
    .select(cardCols)
    .from(likes)
    .innerJoin(artworks, eq(artworks.id, likes.artworkId))
    .where(and(eq(likes.userId, userId), visible()))
    .orderBy(desc(likes.createdAt))) as ArtCard[];
}

/** What the artwork page needs to know about the signed-in viewer. */
export async function getViewerState(userId: string, artworkId: string) {
  const db = getDb();
  const [liked] = await db.select({ a: likes.artworkId }).from(likes).where(and(eq(likes.userId, userId), eq(likes.artworkId, artworkId)));
  const mine = await db.select({ id: walls.id, title: walls.title, slug: walls.slug }).from(walls).where(eq(walls.userId, userId)).orderBy(desc(walls.updatedAt));
  const has = mine.length
    ? await db.select({ wallId: wallItems.wallId }).from(wallItems).where(and(eq(wallItems.artworkId, artworkId), inArray(wallItems.wallId, mine.map((w) => w.id))))
    : [];
  const inSet = new Set(has.map((h) => h.wallId));
  return { liked: !!liked, walls: mine.map((w) => ({ ...w, has: inSet.has(w.id) })) };
}

export async function likeCount(artworkId: string) {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(likes).where(eq(likes.artworkId, artworkId));
  return r?.n ?? 0;
}

export async function sitemapEntries() {
  const db = getDb();
  const [art, pub] = await Promise.all([
    db.select({ id: artworks.id }).from(artworks).where(visible()).orderBy(asc(artworks.id)).limit(5000),
    db.select({ slug: walls.slug, updatedAt: walls.updatedAt }).from(walls).where(eq(walls.isPublic, true)).limit(2000),
  ]);
  return { art: art.map((a) => a.id), walls: pub };
}
