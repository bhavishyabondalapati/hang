ALTER TABLE "artworks" ADD COLUMN "dynasty" text;--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "themes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "collection" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX "artworks_dynasty_idx" ON "artworks" USING btree ("dynasty");--> statement-breakpoint
CREATE INDEX "artworks_themes_idx" ON "artworks" USING gin ("themes");--> statement-breakpoint
CREATE INDEX "artworks_collection_idx" ON "artworks" USING btree ("collection");