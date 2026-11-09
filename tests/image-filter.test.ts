import { describe, expect, it } from "vitest";
import { ALL_LABELS, NEUTRAL_LABELS, THRESHOLDS, UNWANTED_LABELS, WANTED_LABELS, decideImage, type ImageScores } from "@/lib/image-filter";

/** Build a score vector: everything near zero except the given labels. */
function scores(over: Record<string, number>, nsfw = 0.01): ImageScores {
  const labels = Object.fromEntries(ALL_LABELS.map((l) => [l, 0.001]));
  return { nsfw, labels: { ...labels, ...over } };
}

describe("label sets", () => {
  it("cover the brief: five unwanted categories, six wanted labels, no duplicates", () => {
    expect(Object.keys(UNWANTED_LABELS)).toEqual(["horror", "demons", "violence", "death", "nudity"]);
    expect(WANTED_LABELS).toEqual(["dragon", "landscape", "flowers", "birds", "porcelain vase", "calligraphy"]);
    expect(new Set(ALL_LABELS).size).toBe(ALL_LABELS.length);
    expect(NEUTRAL_LABELS.length).toBeGreaterThan(0);
  });
});

describe("decideImage", () => {
  it("keeps ordinary Chinese art", () => {
    expect(decideImage(scores({ dragon: 0.8 })).hidden).toBe(false);
    expect(decideImage(scores({ "porcelain vase": 0.87, "ceramic bowl": 0.05 })).hidden).toBe(false);
    expect(decideImage(scores({ calligraphy: 0.73, "jade carving": 0.16 })).reason).toBeNull();
  });

  it("hides what the NSFW classifier is sure about", () => {
    const d = decideImage(scores({ dragon: 0.5 }, THRESHOLDS.nsfw + 0.01));
    expect(d.hidden).toBe(true);
    expect(d.reason).toMatch(/^image: nsfw 0\.\d\d/);
  });

  it("does not hide on a middling NSFW score alone", () => {
    expect(decideImage(scores({ dragon: 0.7 }, THRESHOLDS.nsfw - 0.1)).hidden).toBe(false);
  });

  it("ignores the NSFW classifier's false alarms on pages of calligraphy, unless it is nearly certain", () => {
    // observed: plain calligraphy pages score 0.5 to 0.86 NSFW
    expect(decideImage(scores({ "a page of calligraphy": 0.7 }, 0.86)).hidden).toBe(false);
    expect(decideImage(scores({ calligraphy: 0.5 }, 0.7)).hidden).toBe(false);
    expect(decideImage(scores({ "a page of calligraphy": 0.7 }, THRESHOLDS.nsfwOnTextPage + 0.01)).hidden).toBe(true);
    // the same NSFW score on something that is not a text page is hidden
    expect(decideImage(scores({ "a jade carving of an animal": 0.7 }, 0.86)).hidden).toBe(true);
  });

  it("hides a single strong unwanted phrase, naming the category and phrase", () => {
    const d = decideImage(scores({ "a bloody scene of killing": THRESHOLDS.unwantedSingle + 0.05 }));
    expect(d.hidden).toBe(true);
    expect(d.reason).toContain("violence");
    expect(d.reason).toContain("a bloody scene of killing");
  });

  it.each(Object.entries(UNWANTED_LABELS).map(([category, phrases]) => [category, phrases[0]!]))("hides %s via %j", (category, phrase) => {
    const d = decideImage(scores({ [phrase]: 0.4 }));
    expect(d.hidden).toBe(true);
    expect(d.reason).toContain(category);
  });

  it("hides when many weak unwanted signals add up (conservative)", () => {
    const each = (THRESHOLDS.unwantedTotal + 0.02) / 4;
    expect(each).toBeLessThan(THRESHOLDS.unwantedSingle);
    const d = decideImage(scores({ horror: each, demons: each, "a corpse": each, "a naked human body": each }));
    expect(d.hidden).toBe(true);
    expect(d.reason).toContain("total");
  });

  it("reports the combined reasons when several signals fire", () => {
    const d = decideImage(scores({ "a naked human body": 0.6 }, 0.9));
    expect(d.reason).toMatch(/nsfw 0\.90/);
    expect(d.reason).toMatch(/nudity 0\.60/);
  });

  it("respects custom thresholds", () => {
    const s = scores({ demons: 0.2 });
    expect(decideImage(s, { ...THRESHOLDS, unwantedTotal: 0.9, unwantedSingle: 0.3 }).hidden).toBe(false);
    expect(decideImage(s, { ...THRESHOLDS, unwantedTotal: 0.9, unwantedSingle: 0.1 }).hidden).toBe(true);
  });

  it("ignores wanted and neutral labels however high they score", () => {
    expect(decideImage(scores({ dragon: 0.9, landscape: 0.9, "jade carving": 0.9 })).hidden).toBe(false);
  });
});
