import { describe, expect, it } from "vitest";
import { accentOf, contrast, extractPalette, hexToRgb, hslToHex, hueDistance, rgbToHsl, HUE_SWATCHES } from "@/lib/color";
import { centuryLabel, centuryOf, mediumGroupOf, orientationOf } from "@/lib/artwork";

describe("color", () => {
  it("converts rgb to hsl", () => {
    expect(rgbToHsl([255, 0, 0])).toMatchObject({ h: 0, s: 1 });
    expect(Math.round(rgbToHsl([0, 0, 255]).h)).toBe(240);
    expect(rgbToHsl([128, 128, 128]).s).toBe(0);
  });
  it("round-trips hex", () => {
    expect(hslToHex(120, 1, 0.5)).toBe("#00ff00");
    expect(hexToRgb("#0f0")).toEqual([0, 255, 0]);
  });
  it("measures circular hue distance", () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
  });
  it("offers 12 hue swatches", () => {
    expect(HUE_SWATCHES).toHaveLength(12);
  });
  it("extracts a palette ordered by prominence", () => {
    const px: number[] = [];
    for (let i = 0; i < 70; i++) px.push(200, 30, 30); // mostly red
    for (let i = 0; i < 30; i++) px.push(20, 40, 200); // some blue
    const pal = extractPalette(px, 5);
    expect(pal[0]!.hex).toBe("#c81e1e");
    expect(pal[0]!.share).toBeCloseTo(0.7);
    expect(pal).toHaveLength(2);
  });
  it("prefers a colourful accent over a dominant neutral", () => {
    const acc = accentOf([{ hex: "#808080", share: 0.6 }, { hex: "#2040c0", share: 0.2 }])!;
    expect(acc.hex).toBe("#2040c0");
    expect(accentOf([])).toBeNull();
  });
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});

describe("metadata helpers", () => {
  it("buckets centuries", () => {
    expect(centuryOf(1889)).toBe(19);
    expect(centuryOf(1800)).toBe(18);
    expect(centuryOf(1901)).toBe(20);
    expect(centuryOf(-250)).toBe(-3);
    expect(centuryOf(null)).toBeNull();
    expect(centuryLabel(19)).toBe("19th century");
    expect(centuryLabel(21)).toBe("21st century");
    expect(centuryLabel(-3)).toBe("3rd century BCE");
  });
  it("groups media", () => {
    expect(mediumGroupOf("Oil on canvas")).toBe("Painting");
    expect(mediumGroupOf("Woodblock print; ink on paper")).toBe("Print");
    expect(mediumGroupOf("Gelatin silver print")).toBe("Photograph");
    expect(mediumGroupOf("Porcelain with underglaze")).toBe("Ceramics");
    expect(mediumGroupOf(null)).toBe("Other");
  });
  it("classifies orientation", () => {
    expect(orientationOf(2000, 1000)).toBe("landscape");
    expect(orientationOf(1000, 2000)).toBe("portrait");
    expect(orientationOf(1000, 1000)).toBe("square");
    expect(orientationOf(null, 5)).toBeNull();
  });
});
