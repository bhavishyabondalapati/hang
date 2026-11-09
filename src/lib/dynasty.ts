export const DYNASTIES = [
  { slug: "shang", label: "Shang", from: -1600, to: -1046 },
  { slug: "zhou", label: "Zhou", from: -1045, to: -256 },
  { slug: "han", label: "Han", from: -206, to: 220 },
  { slug: "tang", label: "Tang", from: 618, to: 907 },
  { slug: "song", label: "Song", from: 960, to: 1279 },
  { slug: "yuan", label: "Yuan", from: 1280, to: 1368 },
  { slug: "ming", label: "Ming", from: 1368, to: 1644 },
  { slug: "qing", label: "Qing", from: 1644, to: 1911 },
  { slug: "republic", label: "Republic period", from: 1912, to: 1949 },
] as const;

export type Dynasty = (typeof DYNASTIES)[number]["slug"];
export const DYNASTY_SLUGS = DYNASTIES.map((d) => d.slug) as [Dynasty, ...Dynasty[]];
export const dynastyLabel = (slug: string | null | undefined) => DYNASTIES.find((d) => d.slug === slug)?.label ?? null;

// Reign names are unambiguous enough to count as evidence for their dynasty.
const MING_REIGNS = "hongwu|yongle|xuande|chenghua|hongzhi|zhengde|jiajing|longqing|wanli|tianqi|chongzhen";
const QING_REIGNS = "shunzhi|kangxi|yongzheng|qianlong|jiaqing|daoguang|xianfeng|tongzhi|guangxu|xuantong";

const PATTERNS: Array<[Dynasty, RegExp]> = [
  ["shang", /\bshang\s+(dynasty|period)|\bshang\s*\(/i],
  ["zhou", /\b(western |eastern )?zhou\s+(dynasty|period)|\b(western|eastern)\s+zhou\b|\bwarr+ing states\b|\bspring and autumn\b/i],
  ["han", /\b(western |eastern |later |former )?han\s+(dynasty|period)|\b(western|eastern|later|former)\s+han\b/i],
  ["tang", /\btang\s+(dynasty|period)|\btang\s*\(/i],
  ["song", /\b(northern |southern )?song\s+(dynasty|period)|\b(northern|southern)\s+song\b/i],
  ["yuan", /\byuan\s+(dynasty|period)|\byuan\s*\(/i],
  ["ming", new RegExp(`\\bming\\s+(dynasty|period)|\\bming\\s*\\(|\\b(${MING_REIGNS})\\b`, "i")],
  ["qing", new RegExp(`\\b(qing|ch'ing)\\s+(dynasty|period)|\\bqing\\s*\\(|\\b(${QING_REIGNS})\\b`, "i")],
  ["republic", /\brepublic (period|of china)\b|\brepublican period\b/i],
];

// Periods outside our nine (Jin, Liao, Sui, Qin, Neolithic cultures ...). If the museum names one of
// these first, we leave the dynasty empty instead of guessing from the year.
const OTHER = /\b(jin|liao|sui|qin|xia|western xia|wei|northern wei|eastern wei|western wei|northern qi|northern zhou|southern qi|liang|chen|three kingdoms|six dynasties|five dynasties|sixteen kingdoms|neolithic|liangzhu|hongshan|longshan|yangshao|majiayao)\s+(dynasty|dynasties|period|culture|kingdoms)\b/i;

/**
 * Dynasty from the museum's own wording (culture, period, date text; never the title, because
 * "Song" and "Han" are also ordinary words). If none of the nine is named, fall back to the year.
 * The earliest mention wins, so "Qing dynasty, in Ming style" is Qing.
 */
export function parseDynasty(text: Array<string | null | undefined>, dateStart?: number | null, dateEnd?: number | null): Dynasty | null {
  const blob = text.filter(Boolean).join(" | ");
  let best: { slug: Dynasty; at: number } | null = null;
  for (const [slug, re] of PATTERNS) {
    const m = re.exec(blob);
    if (m && (!best || m.index < best.at)) best = { slug, at: m.index };
  }
  const other = OTHER.exec(blob);
  if (other && (!best || other.index <= best.at)) return null;
  if (best) return best.slug;
  const y = dateStart != null && dateEnd != null ? Math.round((dateStart + dateEnd) / 2) : (dateStart ?? dateEnd);
  if (y == null) return null;
  return DYNASTIES.find((d) => y >= d.from && y <= d.to)?.slug ?? null;
}
