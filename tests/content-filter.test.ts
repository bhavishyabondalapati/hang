import { describe, expect, it } from "vitest";
import { screenText, stripHtml } from "@/lib/content-filter";
import { normalizeAic, normalizeCma, normalizeMet, type AicRaw, type CmaRaw, type MetRaw } from "@/lib/adapters";
import aicChina from "./fixtures/aic-china.json";
import cmaChina from "./fixtures/cma-china.json";
import metRobe from "./fixtures/met-70591.json";

const hide = (title: string) => screenText({ title }).hidden;
const keywords = (i: Parameters<typeof screenText>[0]) => screenText(i).hits.map((h) => h.keyword);

describe("keyword filter: terms from the brief", () => {
  it.each([
    ["Court of Hell"], ["Scene from the Underworld"], ["The Ten Kings of Hell"], ["Judgment of the Dead"], ["Judgement of the Dead"],
    ["Demon Queller"], ["Devil Mask"], ["Hungry Ghost Festival"], ["Ghost Scroll"], ["Monster Mask"], ["Skull Cup"], ["Skeleton Puppet"],
    ["Corpse Bearer"], ["Death of the Master"], ["The Dead"], ["Tomb Guardian Figure"], ["Funerary Urn"], ["Burial Jar"],
    ["Execution Ground"], ["Scenes of Torture"], ["Punishments in Hell"], ["Battle of Red Cliffs"], ["War Chariot"], ["Blood Bowl"],
    ["Reclining Nude"], ["Naked Child"], ["Erotic Album"],
  ])("hides %s", (title) => expect(hide(title)).toBe(true));
});

describe("keyword filter: similar terms", () => {
  it.each([
    ["Tomb Pediment"], ["Mortuary Figure of the Zodiac Sign"], ["Coffin Fitting"], ["Buried Treasure"], ["Warrior on Horseback"],
    ["Beheading of a Prisoner"], ["Murdered Minister"], ["Lokapala"], ["Heavenly King"], ["Sexual Scene"], ["Shunga Album"], ["Demonic Figure"],
    ["Yama, King of Hell"], ["Earth Spirit (Zhenmushou)"], ["Cemetery Stele"], ["Slaughter of the Innocents"],
  ])("hides %s", (title) => expect(hide(title)).toBe(true));

  it("catches Chinese terms", () => {
    expect(hide("十王圖")).toBe(true);
    expect(hide("地獄變相圖")).toBe(true);
    expect(hide("墓誌")).toBe(true);
    expect(hide("鬼")).toBe(true);
  });
});

describe("keyword filter: it does not fire on ordinary words", () => {
  it.each([
    ["Dragon Robe"], ["Landscape with Mountains and Rivers"], ["Bowl with Peonies"], ["Hello Kitty Teapot"], ["Shellfish Dish"], ["Shell Inlay"],
    ["Warring States Period Mirror"], ["Dishware"], ["Bowl with Dragons Chasing a Flaming Pearl"], ["Calligraphy in Running Script"],
    ["Tombac Box"], ["Goblet"], ["Gravel Garden"], ["Seal Box"], ["Peaceful Evening"], ["Deadline"], ["Bloomfield Vase"], ["Skullcap"], ["Swarm of Bees"],
  ])("keeps %s", (title) => expect(hide(title)).toBe(false));
});

describe("keyword filter: fields", () => {
  it("checks title, artist, tags, classification and description", () => {
    expect(keywords({ title: "Quiet Pine", tags: ["ghosts", "trees"] })).toContain("ghost");
    expect(keywords({ title: "Quiet Pine", classification: "funerary objects" })).toContain("funerary");
    expect(keywords({ title: "Quiet Pine", artist: "Master of the Skull" })).toContain("skull");
    expect(keywords({ title: "Quiet Pine", description: "<p>Painted soon after the <em>death</em> of the artist.</p>" })).toContain("death");
    expect(keywords({ title: "Quiet Pine" })).toEqual([]);
  });
  it("does not mistake craftsmanship for execution", () => {
    expect(screenText({ title: "Goblet", description: "The surface decoration is intricately executed in low relief." }).hidden).toBe(false);
    expect(screenText({ title: "Print", description: "The prints were executed by means of sets of separate blocks." }).hidden).toBe(false);
    expect(screenText({ title: "Portrait", description: "This portrait was jointly executed by two painters." }).hidden).toBe(false);
    expect(screenText({ title: "Scroll", description: "A scroll admired for the skilful execution of the brushwork." }).hidden).toBe(false);
    expect(screenText({ title: "Scroll", description: "Praised for the fine execution of the design." }).hidden).toBe(false);
    expect(screenText({ title: "Scroll", description: "A scene showing the public execution of rebels." }).hidden).toBe(true);
    expect(screenText({ title: "Scroll", description: "Before his execution, the minister painted this." }).hidden).toBe(true);
    expect(screenText({ title: "Scroll", description: "The executioner raises his sword." }).hidden).toBe(true);
  });
  it("lets the ox-blood glaze through, but not blood", () => {
    expect(screenText({ title: "Bottle Vase", description: "“Ox blood” glaze is one of the Qing dynasty's famous reds." }).hidden).toBe(false);
    expect(screenText({ title: "Bowl", description: "A sang de boeuf (oxblood) glaze." }).hidden).toBe(false);
    expect(screenText({ title: "Battlefield with Blood on the Snow" }).hidden).toBe(true);
    expect(screenText({ title: "Plate", description: "Ox blood glaze, but the scene shows bloodshed." }).hidden).toBe(true);
  });
  it("still finds a later, real match after skipping a benign one", () => {
    expect(screenText({ title: "x", description: "Skilful execution of the pattern. A traitor faces execution at dawn." }).hidden).toBe(true);
  });
  it("reports which field matched, with the text around it", () => {
    const r = screenText({ title: "A Plain Vase", description: "The vase was found in a tomb near Luoyang and later sold." });
    expect(r.hidden).toBe(true);
    expect(r.hits[0]).toMatchObject({ keyword: "tomb", field: "description" });
    expect(r.hits[0]!.snippet).toContain("found in a tomb near");
    expect(r.reasons[0]).toMatch(/^keyword: tomb \(description\): "/);
  });
  it("lists every distinct keyword once", () => {
    const r = screenText({ title: "Battle in Hell", description: "A bloody battle, a battle of demons." });
    expect(r.reasons.map((x) => x.split(" ")[1])).toEqual(expect.arrayContaining(["hell", "battle", "blood", "demon"]));
    expect(new Set(r.reasons.map((x) => x.split(" ")[1])).size).toBe(r.reasons.length);
  });
  it("handles missing fields and strips HTML entities", () => {
    expect(screenText({}).hidden).toBe(false);
    expect(screenText({ title: null, tags: null, description: undefined }).hidden).toBe(false);
    expect(stripHtml("<p>a&nbsp;b &amp; c</p>")).toBe("a b & c");
  });
});

describe("adapters carry the text the filter needs", () => {
  it("AIC: description, subjects and terms", () => {
    const raw = { ...(aicChina.data[1] as AicRaw), description: "<p>Dragons fight in a battle above the waves.</p>", subject_titles: ["dragons", "ghosts"], classification_titles: ["dish (vessel)"] };
    const a = normalizeAic(raw)!;
    expect(a.description).toContain("battle");
    expect(a.tags).toEqual(expect.arrayContaining(["dragons", "ghosts"]));
    expect(a.classification).toContain("dish (vessel)");
    expect(screenText(a).hidden).toBe(true);
  });
  it("CMA: description and find spot", () => {
    const a = normalizeCma({ ...(cmaChina.data[1] as CmaRaw), find_spot: "Excavated from a tomb" })!;
    expect(a.description).toContain("tomb");
    expect(screenText(a).hits.map((h) => h.keyword)).toContain("tomb");
  });
  it("Met: tags and classification", () => {
    const a = normalizeMet({ ...(metRobe as MetRaw), tags: [{ term: "Skeletons" }, { term: "Dragons" }] })!;
    expect(a.tags).toEqual(["Skeletons", "Dragons"]);
    expect(screenText(a).hits.map((h) => h.keyword)).toContain("skeleton");
  });
  it("the recorded, unmodified fixtures pass or fail on their real text", () => {
    // a dragon robe and a dragon dish are fine
    expect(screenText(normalizeMet(metRobe as MetRaw)!).hidden).toBe(false);
    expect(screenText(normalizeAic(aicChina.data[1] as AicRaw)!).hidden).toBe(false);
  });
});
