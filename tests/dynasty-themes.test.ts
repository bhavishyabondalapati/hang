import { describe, expect, it } from "vitest";
import { DYNASTIES, parseDynasty } from "@/lib/dynasty";
import { classifyThemes } from "@/lib/themes";
import { mediumGroupOf } from "@/lib/artwork";
import { pixelStats, rejectReason } from "@/lib/ingest-image";

describe("parseDynasty", () => {
  it("lists the nine dynasties in order", () => {
    expect(DYNASTIES.map((d) => d.slug)).toEqual(["shang", "zhou", "han", "tang", "song", "yuan", "ming", "qing", "republic"]);
  });
  it.each([
    [["China, Southern Song dynasty (1127–1279)"], "song"],
    [["Eastern Zhou dynasty, Warrring States period (c.480–221 B.C.)"], "zhou"],
    [["Han dynasty (206 B.C.–A.D. 220)"], "han"],
    [["China, Tang dynasty (618–907)"], "tang"],
    [["Yuan dynasty (1271–1368)"], "yuan"],
    [["Ming dynasty (1368–1644), Zhengde reign mark and period"], "ming"],
    [["Jingdezhen, Qing dynasty (1644–1911), Yongzheng mark and period (1723–35)"], "qing"],
    [["Qianlong period (1736–95)"], "qing"],
    [["Republic period (1912–49)"], "republic"],
    [["Shang dynasty, Anyang"], "shang"],
  ])("reads %j as %s", (text, want) => expect(parseDynasty(text)).toBe(want));

  it("takes the earliest mention", () => {
    expect(parseDynasty(["Qing dynasty, in the style of a Ming dynasty original"])).toBe("qing");
  });
  it("falls back to the year when the text names nothing", () => {
    expect(parseDynasty(["China"], 1700, 1750)).toBe("qing");
    expect(parseDynasty([null], -400, -300)).toBe("zhou");
    expect(parseDynasty([null], -260, -240)).toBeNull(); // the Qin gap between Zhou and Han
    expect(parseDynasty([""], 1920, 1930)).toBe("republic");
    expect(parseDynasty(["China"])).toBeNull();
  });
  it("does not guess for periods outside the nine", () => {
    expect(parseDynasty(["China, Jin dynasty (1115-1234)"], 1115, 1234)).toBeNull();
    expect(parseDynasty(["Liao dynasty"], 950, 1100)).toBeNull();
    expect(parseDynasty(["Neolithic period, Liangzhu culture"], -3000, -2500)).toBeNull();
  });
  it("is not fooled by ordinary words", () => {
    expect(parseDynasty(["Song of the Pines"])).toBeNull();
    expect(parseDynasty(["Han Chinese costume"])).toBeNull();
  });
});

describe("classifyThemes", () => {
  const c = (title: string, medium: string, mediumGroup: Parameters<typeof classifyThemes>[0]["mediumGroup"], extra: Partial<Parameters<typeof classifyThemes>[0]> = {}) =>
    classifyThemes({ title, medium, mediumGroup, ...extra });

  it("finds dragons on robes, jars and paintings", () => {
    expect(c("Dragon Robe", "silk", "Textile")).toEqual(expect.arrayContaining(["dragons", "textiles"]));
    expect(c("Jar with Dragons", "Porcelain with underglaze blue", "Ceramics")).toEqual(expect.arrayContaining(["dragons", "porcelain"]));
    expect(c("Nine Dragons", "Handscroll; ink on paper", "Painting")).toContain("dragons");
    expect(c("Covered Jar", "Porcelain", "Ceramics", { description: "The jar is painted with a pair of dragons chasing a pearl." })).toContain("dragons");
    expect(c("Covered Jar", "Porcelain", "Ceramics", { description: `A plain jar made for a merchant of Jingdezhen who traded along the river. ${"It was kept in a family storeroom for generations. ".repeat(5)}A zodiac dragon appears once in the inscription.` })).not.toContain("dragons");
  });
  it("finds ink landscapes only on paintings, not on vases", () => {
    expect(c("Landscape after Ni Zan", "Hanging scroll; ink on paper", "Painting")).toContain("ink-landscapes");
    expect(c("Vase with Landscape", "Porcelain with underglaze blue", "Ceramics")).not.toContain("ink-landscapes");
  });
  it("finds bird-and-flower paintings", () => {
    expect(c("Birds and Flowers", "Album leaf; ink and color on silk", "Painting")).toContain("bird-and-flower");
    expect(c("Bowl with Peonies", "Porcelain", "Ceramics")).not.toContain("bird-and-flower");
  });
  it("finds porcelain, jade, calligraphy and bronzes", () => {
    expect(c("Bottle", "Celadon glazed stoneware", "Ceramics")).toContain("porcelain");
    expect(c("Plate", "Blue-and-white porcelain", "Ceramics")).toContain("porcelain");
    expect(c("Bi disc", "Jade (nephrite)", "Sculpture")).toContain("jade");
    expect(c("Poem in Running Script", "Hanging scroll; ink on paper", "Painting")).toContain("calligraphy");
    expect(c("Ritual Wine Vessel (Zun)", "Bronze", "Sculpture")).toContain("bronzes");
  });
  it("does not call a painted silk fan or a gold ornament a textile", () => {
    expect(c("Peonies", "Fan; painted feathers on silk", "Painting")).not.toContain("textiles");
    expect(c("Textile Ornament: Phoenix", "beaten gold with chased detail", "Decorative")).not.toContain("textiles");
    expect(c("Dragon Robe", "silk, gold thread", "Textile")).toContain("textiles");
    expect(c("Dragon Robe", "Silk and metallic-wrapped thread embroidery", "Textile")).toContain("textiles");
  });
  it("returns nothing for unrelated works", () => {
    expect(c("Bowl", "Stoneware", "Ceramics").includes("dragons")).toBe(false);
  });
});

describe("mediumGroupOf for Chinese works", () => {
  it("treats ink-on-silk scrolls as paintings, not textiles", () => {
    expect(mediumGroupOf("Hanging scroll; ink on silk")).toBe("Painting");
    expect(mediumGroupOf("Handscroll; ink and color on paper")).toBe("Painting");
  });
  it("keeps prints, ceramics and jade apart", () => {
    expect(mediumGroupOf("Woodblock print; ink on paper")).toBe("Print");
    expect(mediumGroupOf("Celadon-glazed stoneware with relief decoration")).toBe("Ceramics");
    expect(mediumGroupOf("Jade (nephrite)")).toBe("Sculpture");
    expect(mediumGroupOf("Round glass bead with pattern placed on the surface")).not.toBe("Textile");
  });
});

describe("image quality gate", () => {
  const solid = (r: number, g: number, b: number, n = 400) => Uint8Array.from({ length: n * 3 }, (_, i) => [r, g, b][i % 3]!);
  const noisy = Uint8Array.from({ length: 1200 }, (_, i) => ((i * 53) % 200) + 30);
  const ok = { width: 1000, height: 1200 };

  it("rejects tiny images", () => {
    expect(rejectReason({ width: 400, height: 500, ...pixelStats(noisy) })).toMatch(/tiny/);
    expect(rejectReason({ width: 2000, height: 200, ...pixelStats(noisy) })).toMatch(/tiny/);
  });
  it("rejects mostly black and mostly blank images", () => {
    expect(rejectReason({ ...ok, ...pixelStats(solid(3, 3, 3)) })).toMatch(/black/);
    expect(rejectReason({ ...ok, ...pixelStats(solid(255, 255, 255)) })).toMatch(/blank/);
    expect(rejectReason({ ...ok, ...pixelStats(solid(128, 120, 110)) })).toMatch(/flat/);
  });
  it("accepts a normal image", () => {
    expect(rejectReason({ ...ok, ...pixelStats(noisy) })).toBeNull();
  });
});
