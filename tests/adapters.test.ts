import { describe, expect, it } from "vitest";
import aicChina from "./fixtures/aic-china.json";
import aicJapan from "./fixtures/aic-japan.json";
import cmaChina from "./fixtures/cma-china.json";
import metDragon from "./fixtures/met-43084.json";
import metRobe from "./fixtures/met-70591.json";
import metJapan from "./fixtures/met-45734.json";
import { normalizeAic, normalizeCma, normalizeMet, type AicRaw, type CmaRaw, type MetRaw } from "@/lib/adapters";
import { idSchema } from "@/lib/artwork";

describe("AIC adapter (Arts of Asia, China, public domain)", () => {
  const dish = normalizeAic(aicChina.data[1] as AicRaw)!;

  it("maps the recorded Chinese dish", () => {
    expect(dish.id).toBe("aic:21284");
    expect(dish.title).toBe("Dish with Dragons Writhing amid Floral Scrolls");
    expect(dish.dynasty).toBe("ming");
    expect(dish.themes).toEqual(expect.arrayContaining(["dragons", "porcelain"]));
    expect(dish.mediumGroup).toBe("Ceramics");
    expect(dish.museum).toBe("Art Institute of Chicago");
    expect(dish.sourceUrl).toBe("https://www.artic.edu/artworks/21284");
  });

  it("builds IIIF urls at three sizes plus a tile base", () => {
    expect(dish.imageSmall).toMatch(/\/full\/400,\/0\/default\.jpg$/);
    expect(dish.imageMedium).toMatch(/\/full\/843,\/0\/default\.jpg$/);
    expect(dish.imageLarge).toMatch(/\/full\/1686,\/0\/default\.jpg$/);
    expect(dish.iiifBase).toMatch(/^https:\/\/www\.artic\.edu\/iiif\/2\//);
  });

  it("reads a Han dynasty work from the date text", () => {
    expect(normalizeAic(aicChina.data[2] as AicRaw)?.dynasty).toBe("han");
  });

  it("produces ids that pass the id schema", () => {
    for (const r of aicChina.data) {
      const a = normalizeAic(r as AicRaw);
      if (a) expect(idSchema.safeParse(a.id).success).toBe(true);
    }
  });

  it("rejects non-Chinese Asian art, other departments, non-public-domain and image-less works", () => {
    expect(normalizeAic(aicJapan.data[0] as AicRaw)).toBeNull();
    expect(normalizeAic({ ...(aicChina.data[1] as AicRaw), department_title: "European Painting and Sculpture" })).toBeNull();
    expect(normalizeAic({ ...(aicChina.data[1] as AicRaw), is_public_domain: false })).toBeNull();
    expect(normalizeAic({ ...(aicChina.data[1] as AicRaw), image_id: null })).toBeNull();
    expect(normalizeAic({ ...(aicChina.data[1] as AicRaw), place_of_origin: "Korea" })).toBeNull();
  });
});

describe("Met adapter (Asian Art, culture China, public domain)", () => {
  const dragon = normalizeMet(metDragon as MetRaw)!;
  const robe = normalizeMet(metRobe as MetRaw)!;

  it("maps the recorded dragon and robe", () => {
    expect(dragon.id).toBe("met:43084");
    expect(dragon.themes).toContain("dragons");
    expect(robe.id).toBe("met:70591");
    expect(robe.title).toBe("Dragon Robe");
    expect(robe.themes).toEqual(expect.arrayContaining(["dragons", "textiles"]));
    expect(robe.mediumGroup).toBe("Textile");
    expect(robe.sourceUrl).toMatch(/^https:\/\/www\.metmuseum\.org\//);
  });

  it("uses the web image for grid/detail and the original for zoom", () => {
    expect(robe.imageSmall).toContain("/web-large/");
    expect(robe.imageLarge).toContain("/original/");
  });

  it("has no pixel size from the API (filled in at ingest)", () => {
    expect(robe.width).toBeNull();
  });

  it("rejects Japanese art, other departments, anything not public domain, and image-less works", () => {
    expect(normalizeMet(metJapan as MetRaw)).toBeNull();
    expect(normalizeMet({ ...(metRobe as MetRaw), department: "European Paintings" })).toBeNull();
    expect(normalizeMet({ ...(metRobe as MetRaw), isPublicDomain: false })).toBeNull();
    expect(normalizeMet({ ...(metRobe as MetRaw), primaryImage: "", primaryImageSmall: "" })).toBeNull();
  });
});

describe("Cleveland adapter (Chinese Art, CC0)", () => {
  const [scroll, plate, vase, bowl] = cmaChina.data.map((r) => normalizeCma(r as CmaRaw));

  it("maps the recorded Southern Song dragon scroll", () => {
    expect(scroll!.id).toBe("cma:135431");
    expect(scroll!.artist).toBe("Fachang Muqi");
    expect(scroll!.dynasty).toBe("song");
    expect(scroll!.themes).toContain("dragons");
    expect(scroll!.mediumGroup).toBe("Painting");
    expect(scroll!.sourceUrl).toMatch(/^https:\/\/clevelandart\.org\/art\//);
  });

  it("recognises porcelain, and a reign mark inside the Qing", () => {
    expect(plate!.dynasty).toBe("yuan");
    expect(plate!.mediumGroup).toBe("Ceramics");
    expect(vase!.dynasty).toBe("qing");
    expect(vase!.themes).toContain("porcelain");
  });

  it("does not guess a dynasty for the Jin period (outside our nine)", () => {
    expect(bowl!.dynasty).toBeNull();
  });

  it("takes pixel size and image tiers from the images block", () => {
    expect(scroll!.width).toBe(304);
    expect(scroll!.height).toBe(900);
    expect(scroll!.imageSmall).toContain("_web.jpg");
    expect(scroll!.imageLarge).toContain("_print.jpg");
  });

  it("only accepts CC0 works from the Chinese Art department", () => {
    const raw = cmaChina.data[0] as CmaRaw;
    expect(normalizeCma({ ...raw, share_license_status: "Copyrighted" })).toBeNull();
    expect(normalizeCma({ ...raw, department: "Japanese Art" })).toBeNull();
  });
});
