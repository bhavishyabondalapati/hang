import type { MediumGroup } from "./artwork";

export const CHINA_THEMES = [
  { slug: "dragons", label: "Dragons" },
  { slug: "ink-landscapes", label: "Ink landscapes" },
  { slug: "bird-and-flower", label: "Bird and flower" },
  { slug: "porcelain", label: "Blue-and-white & celadon" },
  { slug: "jade", label: "Jade" },
  { slug: "textiles", label: "Silk & embroidery" },
  { slug: "calligraphy", label: "Calligraphy" },
  { slug: "bronzes", label: "Bronzes" },
] as const;

export type ChinaTheme = (typeof CHINA_THEMES)[number]["slug"];
export const THEME_SLUGS = CHINA_THEMES.map((t) => t.slug) as [ChinaTheme, ...ChinaTheme[]];
export const themeLabel = (s: string) => CHINA_THEMES.find((t) => t.slug === s)?.label ?? s;

/** Themes eligible for "Today's piece": the ones that make a strong full-bleed image. */
export const DAILY_THEMES: ChinaTheme[] = ["dragons", "ink-landscapes", "bird-and-flower", "porcelain"];

/** Search terms used by the ingest script for each theme, per museum search box. */
export const THEME_QUERIES: Record<ChinaTheme, string[]> = {
  dragons: ["dragon", "dragon robe", "dragon jar", "nine dragons"],
  "ink-landscapes": ["landscape", "mountains and rivers", "ink landscape", "hanging scroll mountains", "river", "pine", "waterfall", "mountain retreat"],
  "bird-and-flower": ["bird and flower", "flowers and birds", "plum blossom", "bamboo", "lotus", "birds", "peony", "chrysanthemum", "orchid", "magpie", "crane", "album leaf flowers", "fan painting"],
  porcelain: ["blue and white porcelain", "celadon", "porcelain vase", "porcelain bowl"],
  jade: ["jade", "jade carving"],
  textiles: ["embroidered", "silk robe", "kesi tapestry", "textile", "rank badge", "robe", "embroidery", "brocade", "sleeve band", "costume"],
  calligraphy: ["calligraphy", "poem", "cursive script", "running script", "couplet", "handscroll poem", "colophon", "letter", "regular script"],
  bronzes: ["bronze", "ritual vessel", "bronze mirror"],
};

export type ThemeInput = {
  title: string;
  medium?: string | null;
  classification?: string | null;
  tags?: string[];
  description?: string | null;
  mediumGroup: MediumGroup;
};

const has = (s: string, re: RegExp) => re.test(s);

/** Keyword classifier over title, medium, classification and tags. Works can match several themes. */
export function classifyThemes(i: ThemeInput): ChinaTheme[] {
  const title = i.title.toLowerCase();
  const medium = (i.medium ?? "").toLowerCase();
  const cls = (i.classification ?? "").toLowerCase();
  const tags = (i.tags ?? []).join(" ").toLowerCase();
  const all = `${title} | ${medium} | ${cls} | ${tags}`;
  const desc = (i.description ?? "").toLowerCase().replace(/<[^>]+>/g, " ").slice(0, 600);

  const paintingLike = i.mediumGroup === "Painting" || i.mediumGroup === "Drawing" || has(medium, /\b(ink|colors?)\b.*\bon (silk|paper)\b|hanging scroll|handscroll|album leaf|fan\b/);
  const ceramic = has(all, /porcelain|stoneware|earthenware|celadon|glaze|ceramic|pottery/);
  const out: ChinaTheme[] = [];

  // A dragon in the title, medium or tags; or a curator's description that leads with one (or dwells on it)
  const descDragons = (desc.match(/\bdragons?\b/g) ?? []).length;
  if (has(`${title} ${medium} ${tags}`, /\bdragons?\b/) || /\bdragons?\b/.test(desc.slice(0, 250)) || descDragons >= 2) out.push("dragons");
  if (paintingLike && !ceramic && has(`${title} ${tags}`, /\b(landscapes?|mountains?|rivers?|peaks?|streams?|waterfalls?|lakes?|valleys?|cliffs?|pines?)\b/)) out.push("ink-landscapes");
  if (paintingLike && !ceramic && has(`${title} ${tags}`, /\b(birds?|flowers?|floral|blossoms?|plums?|peonies|peony|lotus|orchids?|bamboo|chrysanthemums?|magpies?|cranes?|sparrows?|pheasants?|ducks?|geese|swallows?|hawks?|egrets?|prunus|camellias?|quail|butterfl\w+|cat)\b/)) out.push("bird-and-flower");
  if (has(all, /porcelain|celadon|blue[- ]and[- ]white|underglaze blue|qingbai|doucai|famille/)) out.push("porcelain");
  if (has(all, /\b(jade|nephrite|jadeite)\b/)) out.push("jade");
  // Silk and embroidery: only when the object is actually cloth (a gold "textile ornament" or a painted fan is not)
  const notCloth = has(medium, /\b(gold|silver|glass|bronze|jade|stone|ceramic|porcelain|wood|lacquer|ivory|feathers?)\b/) && !has(medium, /\b(threads?|yarns?|weft|woven|embroider\w*|brocade\w*)\b/);
  const clothWords = has(`${title} ${cls}`, /embroider|\brobes?\b|tapestry|kesi|brocade|textile|damask|rank badge|sleeve band|costume|carpet/) || has(medium, /embroider|tapestry|kesi|brocade|satin|damask/);
  if (!paintingLike && !notCloth && (i.mediumGroup === "Textile" || clothWords)) out.push("textiles");
  if (has(all, /calligraph|cursive script|running script|regular script|seal script|clerical script|\bpoems?\b|couplet|\bcolophon\b/)) out.push("calligraphy");
  if (has(all, /\bbronze\b|ritual (vessel|wine)/) && !has(medium, /bronze.*(glaze|enamel)/)) out.push("bronzes");
  return out;
}
