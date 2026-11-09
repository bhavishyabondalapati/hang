# Decisions

Judgement calls made without stopping to ask.

- **Node via conda.** Per project convention, a conda env named `hang` (Node 22 from conda-forge) holds the toolchain; nothing is installed into base.
- **`.env.local` is untouched.** It already held the real secrets. It is gitignored (`.env*`, except `.env.example`) before the first commit.
- **No `requirements.txt` / pytest.** This is a Node project; `package.json` and Vitest/Playwright play those roles.
- **No Claude co-author trailers.** Commits are authored by the repo's git user only.
- **Tailwind 4 + CSS variables.** Tokens live in CSS variables so light/dark and per-artwork tinting share one mechanism.
- **Fonts:** Fraunces (display serif) and Inter Tight (UI), via `next/font`, self-hosted at build.
- **Deep zoom:** OpenSeadragon against AIC's IIIF `info.json` (true tiles). Met and Cleveland have no IIIF tile service, so those use a small custom pan/pinch/wheel viewer on the largest image.
- **Image delivery:** `next/image` for grid and detail. The deep-zoom viewer talks to AIC directly, which is why CSP `connect-src` allows `www.artic.edu`.
- **Art ids:** `source:nativeId` (e.g. `aic:27992`). The colon is legal in a URL path, so `/art/aic:27992` works as is.
- **Search:** a generated `tsvector` column with a GIN index; weighted title > artist > culture/medium. Color search uses nearest hue (circular distance) among chromatic works; neutrals bucket separately.
- **Hue swatches:** 12 swatches at 30-degree steps.
- **Daily artwork:** deterministic hash of the UTC date over a stable ordering of artworks (no randomness, no state).
- **Rate limiting:** in-memory sliding window per user per action. It resets per serverless instance, which is fine as abuse friction; a shared store (Upstash) is the upgrade path.
- **Sessions:** Auth.js database sessions through the Drizzle adapter (so ownership is checked against a real user row).
- **E2E sign-in is mocked** with a test-only credentials provider that is only enabled when `E2E_AUTH=1`, never in production builds.
- **Ingest size (original):** ~1,000 per museum, concurrency-limited, with backoff and `ON CONFLICT DO UPDATE` for idempotency.

## Switch to Chinese art

- **"The content filter from the last task".** The previous task had no separate content filter, so I treated this as the gate that was already there: public domain / CC0 only. It is now enforced in three places: each adapter (licence + Chinese department), the ingest quality check, and a `collection = 'china'` condition on every read query. If you meant a different filter, tell me what it hid.
- **`collection` column instead of wiping first.** Rows ingested for this collection carry `collection = 'china'`; everything older is `legacy`. I ingested first, checked the counts, then ran `prune`, so the database was never empty. Wall items and likes cascade away with their artworks.
- **Test data removed.** Test accounts (`@e2e.test`) and their walls were deleted with the legacy works. There were no real user accounts.
- **Themes are many-to-many.** `themes text[]` with a GIN index; a dragon robe is both Dragons and Silk & embroidery. The ingest balances by theme *deficit* (target ≈ total / 8 per theme), asks Cleveland and the Art Institute first, then lets the Met fill what is left, and trims themes that overshoot by more than 15% (never touching works on a wall or liked).
- **Textiles come from the Met.** Cleveland's and the Art Institute's Chinese departments hold almost no textiles (those live in separate Textile departments, which the brief did not name), so the Silk & embroidery theme is mostly Met.
- **Dynasty list is the nine named.** Works from other periods (Jin, Liao, Sui, Neolithic cultures ...) get no dynasty and simply do not appear under the dynasty chips. Dynasty is parsed from the museum's culture/period/date text first, then the year.
- **Met image size.** The Met API gives no pixel size and its web renditions top out near 600px, so "tiny" is judged from the original image's file size (a HEAD request). The Met works are therefore shown at about 600px in the grid and detail view; deep zoom uses the original.
- **Today's piece.** Only dragon, ink landscape, bird-and-flower and porcelain works whose shorter side is at least 600px; tall works are shown whole (object-contain) on their own palette colour instead of being cropped.
- **Accent.** Cinnabar `#b02a1c` on paper and `#ec7e69` in dark mode (both AA on every surface). The wall placard seal is a plain flat red square with a carved inner square: no characters, no decorative motifs, no special fonts.
