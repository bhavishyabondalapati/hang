export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

/** h in degrees [0,360), s and l in [0,1]. */
export function rgbToHsl([r, g, b]: RGB): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** Shortest distance around the colour wheel, 0..180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export type PaletteColor = { hex: string; share: number };

/**
 * Tiny histogram quantiser: bucket pixels to 4 bits per channel, then walk the
 * buckets from most to least populated, skipping colours too close to one
 * already chosen. Fast, deterministic and good enough for swatches.
 * `pixels` is a flat RGB byte array.
 */
export function extractPalette(pixels: ArrayLike<number>, k = 5, minDistance = 44): PaletteColor[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  const total = Math.floor(pixels.length / 3);
  for (let i = 0; i < total; i++) {
    const r = pixels[i * 3]!, g = pixels[i * 3 + 1]!, b = pixels[i * 3 + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; }
    else bins.set(key, { n: 1, r, g, b });
  }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n);
  const picked: Array<{ rgb: RGB; n: number }> = [];
  for (const e of sorted) {
    const rgb: RGB = [e.r / e.n, e.g / e.n, e.b / e.n];
    if (picked.every((p) => dist(p.rgb, rgb) >= minDistance)) picked.push({ rgb, n: e.n });
    else {
      const near = picked.find((p) => dist(p.rgb, rgb) < minDistance);
      if (near) near.n += e.n; // fold near-duplicates into the colour that claimed them
    }
    if (picked.length >= k * 3) break;
  }
  return picked
    .sort((a, b) => b.n - a.n)
    .slice(0, k)
    .map((p) => ({ hex: rgbToHex(p.rgb), share: total ? p.n / total : 0 }));
}

/**
 * The colour used for hue search: the most prominent palette entry that is
 * actually colourful; otherwise just the most prominent one.
 */
export function accentOf(palette: PaletteColor[]): { hex: string; h: number; s: number; l: number } | null {
  if (!palette.length) return null;
  const chromatic = palette.find((p) => {
    const { s, l } = rgbToHsl(hexToRgb(p.hex));
    return s >= 0.2 && l > 0.1 && l < 0.92;
  });
  const chosen = chromatic ?? palette[0]!;
  return { hex: chosen.hex, ...rgbToHsl(hexToRgb(chosen.hex)) };
}

/** The 12 hue swatches shown in the colour picker (30 degree steps). */
export const HUE_SWATCHES = Array.from({ length: 12 }, (_, i) => {
  const hue = i * 30;
  const names = ["Red", "Orange", "Amber", "Chartreuse", "Green", "Spring", "Cyan", "Azure", "Blue", "Violet", "Magenta", "Rose"];
  return { hue, name: names[i]!, hex: hslToHex(hue, 0.55, 0.5) };
});

/** Relative luminance, WCAG. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
