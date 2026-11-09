ALTER TABLE "artworks" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "classification" text;--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "screened_at" timestamp;--> statement-breakpoint
CREATE INDEX "artworks_hidden_idx" ON "artworks" USING btree ("hidden");