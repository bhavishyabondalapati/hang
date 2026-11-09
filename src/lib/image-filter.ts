/**
 * Content filter, pass 2: images (pure decision logic; the models live in image-classifier.ts).
 *
 * Two local models score every image:
 *   - an NSFW classifier (AdamCodd/vit-base-nsfw-detector): probability the image is nudity / explicit
 *   - CLIP zero-shot (Xenova/clip-vit-base-patch32): the image is scored against unwanted labels
 *     (horror, demons, violence, death, nudity) and wanted ones (dragon, landscape, flowers, ...).
 *     CLIP turns the labels into one probability distribution, so we add a few neutral labels
 *     (bronze vessel, jade carving ...) to stop ordinary objects from being squeezed into the unwanted ones.
 * "When in doubt, hide": any one signal over its threshold hides the work.
 */

export const NSFW_MODEL = "AdamCodd/vit-base-nsfw-detector";
export const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
export const CLIP_TEMPLATE = "an artwork showing {}.";

/**
 * Several phrasings per unwanted category, because CLIP is much better at descriptions than at single words.
 * (Phrases like "a battle scene with soldiers" or "a nude figure" were tried and removed: on ink paintings full of small
 * figures, and on smooth jade carvings, they fired constantly. Checked by eye on contact sheets of the top scorers.)
 */
export const UNWANTED_LABELS: Record<string, string[]> = {
  horror: ["horror", "a horrifying scene", "a skull or skeleton"],
  demons: ["demons", "a demon with fangs", "hell and the underworld"],
  violence: ["violence", "a bloody scene of killing", "people being tortured"],
  death: ["death", "a corpse", "a funeral or tomb"],
  nudity: ["nudity", "a naked human body"],
};
export const WANTED_LABELS = ["dragon", "landscape", "flowers", "birds", "porcelain vase", "calligraphy"];
/**
 * CLIP turns all labels into one probability distribution, so an image that fits none of them gets squeezed into whichever
 * is closest. These labels describe what a Chinese art collection actually contains, so ordinary objects have somewhere
 * ordinary to land instead of the unwanted labels.
 */
export const NEUTRAL_LABELS = [
  "a landscape painting with mountains and water", "a page of calligraphy", "an ink painting of bamboo or plum blossoms",
  "a jade carving of an animal", "a carved jade disc or ornament", "a bronze ritual vessel", "a porcelain bowl or plate",
  "silk embroidery", "a silk robe", "a portrait of a person", "figures in a garden or a room", "a Buddhist statue",
  "a ceramic figure of a horse or camel", "an album leaf painting",
];

export const ALL_LABELS = [...Object.values(UNWANTED_LABELS).flat(), ...WANTED_LABELS, ...NEUTRAL_LABELS];
const PHRASE_TO_CATEGORY = new Map(Object.entries(UNWANTED_LABELS).flatMap(([cat, phrases]) => phrases.map((p) => [p, cat] as const)));
/** Labels meaning "this is a page of writing", where the NSFW classifier is known to misfire. */
const TEXT_PAGE_LABELS = ["calligraphy", "a page of calligraphy"];

/** Identifies the model + label set a score was made with; cached scores from another version are discarded. */
export const SCORES_VERSION = [NSFW_MODEL, CLIP_MODEL, CLIP_TEMPLATE, ...ALL_LABELS].join("|");

export type ImageScores = {
  /** probability (0..1) that the NSFW classifier calls the image NSFW */
  nsfw: number;
  /** CLIP probabilities for every label in ALL_LABELS (they sum to 1) */
  labels: Record<string, number>;
};

export type Thresholds = {
  /** hide if the NSFW classifier is at least this sure (unless the image looks like a page of writing, see textPageNsfw) */
  nsfw: number;
  /**
   * The NSFW classifier misfires on pages of calligraphy (scores of 0.5 to 0.86 on plain text pages). When CLIP thinks
   * the image is a text page (calligraphy probability at least this), the NSFW score must reach nsfwOnTextPage instead.
   */
  textPageNsfw: number;
  nsfwOnTextPage: number;
  /** hide if the total probability on all unwanted phrases is at least this */
  unwantedTotal: number;
  /** hide if any single unwanted phrase is at least this */
  unwantedSingle: number;
};

/**
 * Chosen from the real score distribution of the collection (contact sheets of the top scorers were checked by eye):
 * at 0.10 / 0.25, 2.1% of 1,657 works are hidden; most of those are false alarms on jade tools and ink paintings, which is
 * the price of "when in doubt, hide". On public-domain Western images with clearly unwanted subjects (nudes, executions,
 * hell, massacres, skulls) the same thresholds caught 34 of 48.
 */
export const THRESHOLDS: Thresholds = { nsfw: 0.5, textPageNsfw: 0.3, nsfwOnTextPage: 0.97, unwantedTotal: 0.25, unwantedSingle: 0.10 };

export type ImageDecision = { hidden: boolean; reason: string | null; unwantedTotal: number; topUnwanted: { phrase: string; category: string; p: number } | null };

export function decideImage(s: ImageScores, t: Thresholds = THRESHOLDS): ImageDecision {
  let total = 0;
  let top: ImageDecision["topUnwanted"] = null;
  for (const [phrase, p] of Object.entries(s.labels)) {
    const category = PHRASE_TO_CATEGORY.get(phrase);
    if (!category) continue;
    total += p;
    if (!top || p > top.p) top = { phrase, category, p };
  }
  const reasons: string[] = [];
  const textPage = TEXT_PAGE_LABELS.reduce((a, l) => a + (s.labels[l] ?? 0), 0);
  const nsfwLimit = textPage >= t.textPageNsfw ? t.nsfwOnTextPage : t.nsfw;
  if (s.nsfw >= nsfwLimit) reasons.push(`nsfw ${s.nsfw.toFixed(2)}`);
  if (top && top.p >= t.unwantedSingle) reasons.push(`${top.category} ${top.p.toFixed(2)} ("${top.phrase}")`);
  else if (total >= t.unwantedTotal && top) reasons.push(`${top.category} ${total.toFixed(2)} total (top: "${top.phrase}" ${top.p.toFixed(2)})`);
  return { hidden: reasons.length > 0, reason: reasons.length ? `image: ${reasons.join("; ")}` : null, unwantedTotal: total, topUnwanted: top };
}
