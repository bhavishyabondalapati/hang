import { ALL_LABELS, CLIP_MODEL, CLIP_TEMPLATE, NSFW_MODEL, type ImageScores } from "./image-filter";

export type ImageClassifier = { score: (image: Buffer) => Promise<ImageScores> };

/**
 * Loads both models locally with transformers.js (ONNX runtime in Node; no API keys, nothing leaves the machine).
 * The first call downloads the model weights from the Hugging Face hub once, then they are cached on disk.
 * Node-only and heavy: import it from scripts, never from app code.
 */
export async function createImageClassifier(): Promise<ImageClassifier> {
  const { pipeline, RawImage } = await import("@huggingface/transformers");
  const nsfw = await pipeline("image-classification", NSFW_MODEL, { dtype: "q8" });
  const clip = await pipeline("zero-shot-image-classification", CLIP_MODEL, { dtype: "q8" });
  return {
    async score(buf) {
      const image = await RawImage.fromBlob(new Blob([new Uint8Array(buf)]));
      const n = (await nsfw(image, { top_k: 2 })) as Array<{ label: string; score: number }>;
      const c = (await clip(image, ALL_LABELS, { hypothesis_template: CLIP_TEMPLATE })) as Array<{ label: string; score: number }>;
      return {
        nsfw: n.find((x) => x.label.toLowerCase() === "nsfw")?.score ?? 0,
        labels: Object.fromEntries(c.map((x) => [x.label, Number(x.score.toFixed(4))])),
      };
    },
  };
}
