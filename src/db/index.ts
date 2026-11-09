import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: ReturnType<typeof make> | null = null;

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return drizzle(neon(url), { schema });
}

/** Lazy so that importing this module never throws at build time. */
export function getDb() {
  return (_db ??= make());
}

export type Db = ReturnType<typeof getDb>;
export { schema };
