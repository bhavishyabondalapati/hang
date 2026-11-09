/**
 * Content filter, pass 1: keywords.
 * Looks at title, artist, tags/subjects, classification and description. Any hit hides the work.
 * It is deliberately blunt and conservative ("when in doubt, hide"); hidden-review.md lists every hit with
 * the matched text in context so a human can check it.
 */

export type ScreenInput = {
  title?: string | null;
  artist?: string | null;
  tags?: readonly string[] | null;
  classification?: string | null;
  description?: string | null;
};

export type KeywordHit = { keyword: string; field: string; snippet: string };
export type ScreenResult = { hidden: boolean; hits: KeywordHit[]; reasons: string[] };

/** [label, pattern]. Patterns are whole-word and case-insensitive; stems are spelled out. */
const RULES: Array<[string, string]> = [
  // underworld, judgment of the dead
  ["hell", "hells?|hellish|hellfire"],
  ["underworld", "underworlds?|netherworld"],
  ["ten kings", "ten kings?|ten courts?|ten judges|ten kings of hell|yama|yanluo|king yan"],
  ["judgment of the dead", "judge?ment of the dead|last judge?ment|judge?ment of souls?"],
  // the supernatural macabre
  ["demon", "demons?|demonic|demoness|demonesses|fiends?"],
  ["devil", "devils?|devilish|satanic"],
  ["ghost", "ghosts?|ghostly|ghouls?|spectres?|specters?|hungry ghosts?"],
  ["monster", "monsters?|monstrous"],
  // death and the body
  ["skull", "skulls?"],
  ["skeleton", "skeletons?|skeletal"],
  ["corpse", "corpses?|cadavers?|carcass(es)?"],
  ["death", "death|deaths|deathbed|deadly"],
  ["dead", "dead"],
  ["tomb", "tombs?|tomb guardians?|tomb[- ]quelling|zhenmushou|earth spirits?"],
  ["funerary", "funerary|funerals?|obsequies"],
  ["burial", "burials?|buried|interment|grave goods"],
  ["grave", "graves?|graveyard|gravesite"],
  ["mortuary", "mortuary|coffins?|sarcophag(us|i)|mausolea|mausoleums?|cemeter(y|ies)"],
  ["heavenly king", "lokapalas?|heavenly kings?|guardian kings?"],
  // violence
  ["execution", "executions?|executioners?|put to death"],
  ["torture", "tortur(e|es|ed|ing)|torments?|tormented"],
  ["punishment", "punish(ment|ments|ed|es|ing)"],
  ["battle", "battles?|battlefields?"],
  ["war", "wars?|warfare|wartime"],
  ["warrior", "warriors?|soldiers?|combat"],
  ["blood", "blood|bloody|bloodshed|bloodied"],
  ["violence", "violen(ce|t)|brutal(ity)?|kill(s|ed|ing)?|slain|slaughter(ed)?|massacres?|murder(s|ed|ers)?|assassin(s|ated|ation)?|behead(s|ed|ing)?|decapitat(e|ed|ion)"],
  // nudity and sexual content
  ["nude", "nudes?|nudity"],
  ["naked", "naked|unclothed|undressed|bare-breasted|topless"],
  ["erotic", "erotic(a|ism)?|sexual(ly)?|sexuality|shunga|pornograph(y|ic)|copulat\\w+|phall(us|ic)|lewd|obscene"],
];

const WORD = (alt: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, "giu");
export const KEYWORD_RULES = RULES.map(([label, alt]) => ({ label, re: WORD(alt) }));

/**
 * A few words have a harmless everyday sense that museum descriptions use all the time. These narrow checks look at the
 * text around a match and let it through only in those specific senses; everything else stays literal and conservative.
 */
const CRAFT_BEFORE = /(skil\w*|fine|exquisite|careful|delicate|precise|technical|masterful|bold|fluid|deft|confident|elegant|refined|expert|accomplished|quality of|in (its|their|the))\W+$/i;
const CRAFT_AFTER = /^\W*of (the|a|an|his|her|their|this|these|its) (design|painting|work|image|pattern|lines?|composition|decoration|carving|brushwork|ornament|piece|scene|figure|motif)/i;
const BENIGN: Record<string, (before: string, after: string) => boolean> = {
  // "skilful execution", "execution of the design": craftsmanship, not killing
  execution: (before, after) => CRAFT_BEFORE.test(before) || CRAFT_AFTER.test(after),
  // "ox blood glaze" / "ox-blood red": a famous Chinese red glaze
  blood: (before) => /\box[- ]?$/i.test(before),
};

/** Chinese terms (no word boundaries in CJK). Kept to unambiguous, strongly relevant characters. */
const CJK_RULES: Array<[string, RegExp]> = [
  ["hell", /地獄|地狱|十殿|閻羅|阎罗/],
  ["ten kings", /十王/],
  ["ghost", /鬼/],
  ["demon", /魔|妖怪/],
  ["skull", /骷髏|骷髅/],
  ["corpse", /屍|尸體|尸体/],
  ["tomb", /墓|陵寢/],
  ["burial", /葬|殉/],
  ["execution", /斬首|斩首|凌遲|凌迟/],
  ["nude", /裸/],
  ["erotic", /春宮|春宫|春畫|春画/],
];

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();
}

function snippetAround(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 32);
  const to = Math.min(text.length, index + length + 32);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`.replace(/\s+/g, " ");
}

function scanField(field: string, raw: string | null | undefined, hits: KeywordHit[]) {
  if (!raw) return;
  const text = stripHtml(raw);
  for (const { label, re } of KEYWORD_RULES) {
    const benign = BENIGN[label];
    for (const m of text.matchAll(re)) {
      if (benign?.(text.slice(Math.max(0, m.index - 40), m.index), text.slice(m.index + m[0].length, m.index + m[0].length + 40))) continue;
      hits.push({ keyword: label, field, snippet: snippetAround(text, m.index, m[0].length) });
      break; // one hit per keyword per field is enough
    }
  }
  for (const [label, re] of CJK_RULES) {
    const m = re.exec(text);
    if (m) hits.push({ keyword: label, field, snippet: snippetAround(text, m.index, m[0].length) });
  }
}

export function screenText(i: ScreenInput): ScreenResult {
  const hits: KeywordHit[] = [];
  scanField("title", i.title, hits);
  scanField("artist", i.artist, hits);
  scanField("tags", (i.tags ?? []).join(" ; "), hits);
  scanField("classification", i.classification, hits);
  scanField("description", i.description, hits);
  return {
    hidden: hits.length > 0,
    hits,
    // the stored reason: every distinct keyword, with the field(s) it was found in; first snippet for context
    reasons: [...new Set(hits.map((h) => h.keyword))].map((k) => {
      const where = hits.filter((h) => h.keyword === k);
      return `keyword: ${k} (${[...new Set(where.map((w) => w.field))].join(", ")}): "${where[0]!.snippet}"`;
    }),
  };
}
