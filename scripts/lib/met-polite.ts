/**
 * The Met sits behind a WAF that temporarily blocks clients that go too fast (HTTP 403 with an HTML page).
 * So: strictly sequential, about 1 request per second, and if we are blocked we wait it out, then stop for
 * good after a couple of tries instead of pushing. Callers keep whatever they already have, and re-running resumes.
 */
const MET_GAP_MS = 900;
const BLOCK_WAIT_MS = 180_000;
const MAX_BLOCKS = 2;
let blocks = 0;
let gaveUp = false;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

export const metBase = "https://collectionapi.metmuseum.org/public/collection/v1";
export const metGaveUp = () => gaveUp;

async function metGet<T>(url: string): Promise<T | null | "blocked"> {
  const res = await fetch(url, { headers: { "User-Agent": "Hang/0.1 (educational art-curation project)" } });
  if (res.status === 403 || res.status === 429) return "blocked";
  if (!res.ok) return null;
  if (!(res.headers.get("content-type") ?? "").includes("json")) return "blocked";
  return (await res.json()) as T;
}

/** One polite Met API request. Returns null on 404 or once we have given up. */
export async function metSafe<T>(url: string): Promise<T | null> {
  while (!gaveUp) {
    const r = await metGet<T>(url);
    if (r !== "blocked") { await pause(MET_GAP_MS); return r; }
    if (++blocks > MAX_BLOCKS) { gaveUp = true; log("met blocked again: giving up on the Met for this run. Re-run later to add more."); break; }
    log(`met blocked, waiting ${BLOCK_WAIT_MS / 1000}s (${blocks}/${MAX_BLOCKS})`);
    await pause(BLOCK_WAIT_MS);
  }
  return null;
}
