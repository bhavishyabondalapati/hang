/**
 * One-off cleanup after switching the collection to Chinese art:
 *   - deletes artworks that are not part of the Chinese collection (collection <> 'china')
 *     (their wall_items and likes disappear with them via ON DELETE CASCADE)
 *   - deletes test accounts (@e2e.test) and, with them, their walls, likes and sessions
 * Prints what it is about to remove first. Pass --dry to only print.
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL!);
const dry = process.argv.includes("--dry");

const one = async <T extends Record<string, unknown>>(q: Promise<T[]>) => (await q)[0]!;

const china = await one(sql`select count(*)::int n from artworks where collection = 'china'`);
if (!china.n || (china.n as number) < 100) throw new Error(`Refusing to prune: only ${china.n} Chinese works are stored. Run the ingest first.`);

const before = {
  legacyArtworks: (await one(sql`select count(*)::int n from artworks where collection <> 'china'`)).n,
  wallItemsOnLegacy: (await one(sql`select count(*)::int n from wall_items wi join artworks a on a.id = wi.artwork_id where a.collection <> 'china'`)).n,
  likesOnLegacy: (await one(sql`select count(*)::int n from likes l join artworks a on a.id = l.artwork_id where a.collection <> 'china'`)).n,
  testUsers: (await one(sql`select count(*)::int n from "user" where email like '%@e2e.test'`)).n,
  testWalls: (await one(sql`select count(*)::int n from walls w join "user" u on u.id = w.user_id where u.email like '%@e2e.test'`)).n,
  realUsers: (await one(sql`select count(*)::int n from "user" where email is null or email not like '%@e2e.test'`)).n,
  realWallItemsOnLegacy: (await one(sql`select count(*)::int n from wall_items wi join walls w on w.id = wi.wall_id join "user" u on u.id = w.user_id join artworks a on a.id = wi.artwork_id where a.collection <> 'china' and u.email not like '%@e2e.test'`)).n,
};
console.log("about to remove:", before);
if (dry) process.exit(0);

await sql`delete from "user" where email like '%@e2e.test'`; // cascades walls, wall_items, likes, sessions, accounts
await sql`delete from artworks where collection <> 'china'`; // cascades wall_items, likes

console.log("after:", {
  artworks: (await one(sql`select count(*)::int n from artworks`)).n,
  walls: (await one(sql`select count(*)::int n from walls`)).n,
  wallItems: (await one(sql`select count(*)::int n from wall_items`)).n,
  likes: (await one(sql`select count(*)::int n from likes`)).n,
});
