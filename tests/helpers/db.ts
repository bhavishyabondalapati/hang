import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

/** A throwaway in-memory Postgres with the real migrations applied. */
export async function makeTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

export async function seed(db: Awaited<ReturnType<typeof makeTestDb>>) {
  await db.insert(schema.users).values([
    { id: "alice", name: "Alice", email: "a@example.com" },
    { id: "bob", name: "Bob", email: "b@example.com" },
  ]);
  const base = { source: "aic" as const, imageSmall: "s", imageMedium: "m", imageLarge: "l", museum: "AIC", sourceUrl: "u", collection: "china" };
  await db.insert(schema.artworks).values([
    ...["1", "2", "3", "4"].map((n) => ({ ...base, id: `aic:${n}`, nativeId: n, title: `Work ${n}` })),
    // not part of the Chinese collection: must be invisible and un-addable
    { ...base, id: "aic:900", nativeId: "900", title: "Legacy Western Work", collection: "legacy" },
  ]);
}
