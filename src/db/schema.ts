import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/* ---------------- Auth.js tables ---------------- */

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  handle: text("handle"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (a) => [primaryKey({ columns: [a.provider, a.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (v) => [primaryKey({ columns: [v.identifier, v.token] })],
);

/* ---------------- Artworks ---------------- */

export const artworks = pgTable(
  "artworks",
  {
    id: text("id").primaryKey(), // "source:nativeId"
    source: text("source").$type<"aic" | "met" | "cma">().notNull(),
    nativeId: text("native_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist"),
    date: text("date"),
    dateStart: integer("date_start"),
    dateEnd: integer("date_end"),
    century: integer("century"),
    medium: text("medium"),
    mediumGroup: text("medium_group").notNull().default("Other"),
    dimensions: text("dimensions"),
    culture: text("culture"),
    /** shang | zhou | han | tang | song | yuan | ming | qing | republic */
    dynasty: text("dynasty"),
    /** theme slugs, see src/lib/themes.ts */
    themes: text("themes").array().notNull().default(sql`'{}'::text[]`),
    /** "china" for the current collection; anything else is leftover data from before the focus change */
    collection: text("collection").notNull().default("legacy"),
    imageSmall: text("image_small").notNull(),
    imageMedium: text("image_medium").notNull(),
    imageLarge: text("image_large").notNull(),
    iiifBase: text("iiif_base"),
    width: integer("width"),
    height: integer("height"),
    orientation: text("orientation").$type<"landscape" | "portrait" | "square">(),
    dominantColor: text("dominant_color"),
    palette: text("palette").array().notNull().default(sql`'{}'::text[]`),
    hue: real("hue"),
    saturation: real("saturation"),
    lightness: real("lightness"),
    museum: text("museum").notNull(),
    sourceUrl: text("source_url").notNull(),
    creditLine: text("credit_line"),
    /** Stable pseudo-random order key used by "Wander" and the daily piece. */
    shuffle: doublePrecision("shuffle").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(artist, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(culture, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(medium, '')), 'D')`,
    ),
  },
  (t) => [
    index("artworks_search_idx").using("gin", t.search),
    index("artworks_source_idx").on(t.source),
    index("artworks_century_idx").on(t.century),
    index("artworks_dynasty_idx").on(t.dynasty),
    index("artworks_themes_idx").using("gin", t.themes),
    index("artworks_collection_idx").on(t.collection),
    index("artworks_medium_group_idx").on(t.mediumGroup),
    index("artworks_hue_idx").on(t.hue),
    index("artworks_orientation_idx").on(t.orientation),
    index("artworks_shuffle_idx").on(t.shuffle, t.id),
  ],
);

/* ---------------- Walls ---------------- */

export const walls = pgTable(
  "walls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    isPublic: boolean("is_public").notNull().default(false),
    theme: text("theme").$type<"plaster" | "gallery-white" | "night">().notNull().default("plaster"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("walls_slug_idx").on(t.slug), index("walls_user_idx").on(t.userId)],
);

export const wallItems = pgTable(
  "wall_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wallId: uuid("wall_id").notNull().references(() => walls.id, { onDelete: "cascade" }),
    artworkId: text("artwork_id").notNull().references(() => artworks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("wall_items_wall_artwork_idx").on(t.wallId, t.artworkId),
    index("wall_items_wall_pos_idx").on(t.wallId, t.position),
  ],
);

/* ---------------- Likes ---------------- */

export const likes = pgTable(
  "likes",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    artworkId: text("artwork_id").notNull().references(() => artworks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.artworkId] }), index("likes_artwork_idx").on(t.artworkId)],
);

export type ArtworkRow = typeof artworks.$inferSelect;
export type WallRow = typeof walls.$inferSelect;
