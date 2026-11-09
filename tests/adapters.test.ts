import { describe, expect, it } from "vitest";
import aic from "./fixtures/aic-search.json";
import met from "./fixtures/met-object.json";
import cma from "./fixtures/cma-artworks.json";
import { normalizeAic, normalizeCma, normalizeMet, type AicRaw, type CmaRaw, type MetRaw } from "@/lib/adapters";
import { idSchema } from "@/lib/artwork";

describe("AIC adapter", () => {
  const raw = aic.data[0] as AicRaw;
  const a = normalizeAic(raw)!;

  it("maps core fields from the recorded fixture", () => {
    expect(a.id).toBe("aic:28560");
    expect(a.title).toBe("The Bedroom");
    expect(a.artist).toBe("Vincent van Gogh");
    expect(a.date).toBe("1889");
    expect(a.medium).toBe("Oil on canvas");
    expect(a.mediumGroup).toBe("Painting");
    expect(a.museum).toBe("Art Institute of Chicago");
    expect(a.sourceUrl).toBe("https://www.artic.edu/artworks/28560");
    expect(a.width).toBe(12614);
    expect(a.height).toBe(9875);
  });

  it("builds IIIF urls at three sizes plus a tile base", () => {
    expect(a.imageSmall).toMatch(/\/full\/400,\/0\/default\.jpg$/);
    expect(a.imageMedium).toMatch(/\/full\/843,\/0\/default\.jpg$/);
    expect(a.imageLarge).toMatch(/\/full\/1686,\/0\/default\.jpg$/);
    expect(a.iiifBase).toBe(`https://www.artic.edu/iiif/2/${raw.image_id}`);
  });

  it("produces ids that pass the id schema", () => {
    for (const r of aic.data) expect(idSchema.safeParse(normalizeAic(r as AicRaw)?.id).success).toBe(true);
  });

  it("drops non-public-domain and image-less works", () => {
    expect(normalizeAic({ ...raw, is_public_domain: false })).toBeNull();
    expect(normalizeAic({ ...raw, image_id: null })).toBeNull();
  });

  it("returns null artist for unattributed works", () => {
    const buddha = normalizeAic(aic.data[1] as AicRaw)!;
    expect(buddha.mediumGroup).toBe("Sculpture");
    expect(buddha.artist).toBeNull();
    expect(buddha.culture).toBe("Nagapattinam");
  });
});

describe("Met adapter", () => {
  const a = normalizeMet(met as MetRaw)!;

  it("maps core fields from the recorded fixture", () => {
    expect(a.id).toBe("met:436535");
    expect(a.title).toBe("Wheat Field with Cypresses");
    expect(a.artist).toBe("Vincent van Gogh");
    expect(a.dateStart).toBe(1889);
    expect(a.mediumGroup).toBe("Painting");
    expect(a.creditLine).toContain("Annenberg");
    expect(a.sourceUrl).toBe("https://www.metmuseum.org/art/collection/search/436535");
  });

  it("uses the web image for grid/detail and the original for zoom", () => {
    expect(a.imageSmall).toContain("/web-large/");
    expect(a.imageLarge).toContain("/original/");
  });

  it("has no pixel size from the API (filled in at ingest)", () => {
    expect(a.width).toBeNull();
    expect(a.height).toBeNull();
  });

  it("rejects anything not flagged public domain, or with no image", () => {
    expect(normalizeMet({ ...(met as MetRaw), isPublicDomain: false })).toBeNull();
    expect(normalizeMet({ ...(met as MetRaw), primaryImage: "", primaryImageSmall: "" })).toBeNull();
  });
});

describe("Cleveland adapter", () => {
  const a = normalizeCma(cma.data[0] as CmaRaw)!;

  it("maps core fields from the recorded fixture", () => {
    expect(a.id).toBe("cma:94979");
    expect(a.title).toBe("Nathaniel Hurd");
    expect(a.artist).toBe("John Singleton Copley");
    expect(a.culture).toBe("United States");
    expect(a.dateStart).toBe(1760);
    expect(a.dateEnd).toBe(1770);
    expect(a.sourceUrl).toBe("https://clevelandart.org/art/1915.534");
  });

  it("takes pixel size and image tiers from the images block", () => {
    expect(a.width).toBe(748);
    expect(a.height).toBe(893);
    expect(a.imageSmall).toContain("_web.jpg");
    expect(a.imageLarge).toContain("_print.jpg");
  });

  it("only accepts CC0", () => {
    expect(normalizeCma({ ...(cma.data[0] as CmaRaw), share_license_status: "Copyrighted" })).toBeNull();
  });
});
