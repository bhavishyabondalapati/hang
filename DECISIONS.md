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
- **Ingest size:** ~1,000 per museum, concurrency-limited, with backoff and `ON CONFLICT DO UPDATE` for idempotency.
