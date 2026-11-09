# Hang: build plan

Hang is an art discovery and curation site over public-domain artworks from the
Art Institute of Chicago, the Met, and the Cleveland Museum of Art.

Each step ends in a working state and its own conventional commit.

1. **Scaffold**: Next 15, TS strict, Tailwind 4, lint/test configs, .env.example, gitignore.
2. **Data layer**: Drizzle schema (Auth.js tables, artworks, walls, wall_items, likes), migration, FTS column + indexes.
3. **Normalizers**: one adapter per museum to the shared `Artwork` type, Vitest tests against recorded fixtures.
4. **Ingestion**: `npm run ingest` (idempotent, retry/backoff, sharp palette + hue/lightness), ~3,000 works balanced across museums.
5. **Query layer**: full-text search + filters (museum, century, medium, hue, orientation), cached reads with revalidate tags, daily artwork.
6. **Auth + mutations**: Auth.js v5 GitHub, server actions (wall CRUD, reorder, add/remove, like), Zod, ownership checks, rate limiting; route handlers.
7. **Design system**: tokens, fonts, light/dark + toggle, shell, 404/error.
8. **Pages**: `/`, `/search`, `/art/[id]`, `/walls/[slug]` (+ OG), `/me`.
9. **Tests**: action tests (auth + ownership), Playwright E2E with mocked sign-in.
10. **Polish**: Playwright screenshots (light/dark x mobile/desktop), critique, at least two passes.
11. **Ship**: lint, typecheck, unit, E2E, `next build`; README with diagram; deploy checklist.
12. **Chinese art focus**: Chinese-only adapters, dynasty + theme fields, theme-balanced ingest with quality gate, prune, Dynasty/Theme filters, on-theme daily piece, cinnabar accent and placard seal.
