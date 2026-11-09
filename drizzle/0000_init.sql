CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "artworks" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"native_id" text NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"date" text,
	"date_start" integer,
	"date_end" integer,
	"century" integer,
	"medium" text,
	"medium_group" text DEFAULT 'Other' NOT NULL,
	"dimensions" text,
	"culture" text,
	"image_small" text NOT NULL,
	"image_medium" text NOT NULL,
	"image_large" text NOT NULL,
	"iiif_base" text,
	"width" integer,
	"height" integer,
	"orientation" text,
	"dominant_color" text,
	"palette" text[] DEFAULT '{}'::text[] NOT NULL,
	"hue" real,
	"saturation" real,
	"lightness" real,
	"museum" text NOT NULL,
	"source_url" text NOT NULL,
	"credit_line" text,
	"shuffle" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(artist, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(culture, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(medium, '')), 'D')) STORED
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"user_id" text NOT NULL,
	"artwork_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "likes_user_id_artwork_id_pk" PRIMARY KEY("user_id","artwork_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"handle" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "wall_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wall_id" uuid NOT NULL,
	"artwork_id" text NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'plaster' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_items" ADD CONSTRAINT "wall_items_wall_id_walls_id_fk" FOREIGN KEY ("wall_id") REFERENCES "public"."walls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_items" ADD CONSTRAINT "wall_items_artwork_id_artworks_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walls" ADD CONSTRAINT "walls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artworks_search_idx" ON "artworks" USING gin ("search");--> statement-breakpoint
CREATE INDEX "artworks_source_idx" ON "artworks" USING btree ("source");--> statement-breakpoint
CREATE INDEX "artworks_century_idx" ON "artworks" USING btree ("century");--> statement-breakpoint
CREATE INDEX "artworks_medium_group_idx" ON "artworks" USING btree ("medium_group");--> statement-breakpoint
CREATE INDEX "artworks_hue_idx" ON "artworks" USING btree ("hue");--> statement-breakpoint
CREATE INDEX "artworks_orientation_idx" ON "artworks" USING btree ("orientation");--> statement-breakpoint
CREATE INDEX "artworks_shuffle_idx" ON "artworks" USING btree ("shuffle","id");--> statement-breakpoint
CREATE INDEX "likes_artwork_idx" ON "likes" USING btree ("artwork_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wall_items_wall_artwork_idx" ON "wall_items" USING btree ("wall_id","artwork_id");--> statement-breakpoint
CREATE INDEX "wall_items_wall_pos_idx" ON "wall_items" USING btree ("wall_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "walls_slug_idx" ON "walls" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "walls_user_idx" ON "walls" USING btree ("user_id");