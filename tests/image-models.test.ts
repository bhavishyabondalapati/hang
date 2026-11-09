import { describe, expect, it } from "vitest";
import { createImageClassifier } from "@/lib/image-classifier";
import { decideImage } from "@/lib/image-filter";

/**
 * Runs the REAL local models (downloads them on first use, a few hundred MB, needs the network once).
 * Off by default so the normal test run stays fast and offline:   RUN_MODEL_TESTS=1 npm test
 */
describe.skipIf(!process.env.RUN_MODEL_TESTS)("local image models", () => {
  const get = async (url: string) => Buffer.from(await (await fetch(url, { headers: { "AIC-User-Agent": "hang-art-app (educational project)" } })).arrayBuffer());
  const aic = (id: string) => `https://www.artic.edu/iiif/2/${id}/full/400,/0/default.jpg`;

  it("scores a blue-and-white vase as wanted and a battle painting as unwanted", async () => {
    const classifier = await createImageClassifier();
    const search = async (q: string) => ((await (await fetch(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&query[term][is_public_domain]=true&limit=1&fields=image_id`)).json()).data[0].image_id as string);
    const vase = decideImage(await classifier.score(await get(aic(await search("blue and white porcelain vase")))));
    const battle = decideImage(await classifier.score(await get(aic(await search("battle of the shield and lance")))));
    expect(vase.hidden).toBe(false);
    expect(battle.hidden).toBe(true);
  }, 300_000);
});
