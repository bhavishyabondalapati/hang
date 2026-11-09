import sharp from "sharp";
import { accentOf, extractPalette, type PaletteColor } from "./color";

export type ImageAnalysis = {
  width: number;
  height: number;
  palette: PaletteColor[];
  dominantColor: string;
  hue: number;
  saturation: number;
  lightness: number;
  /** Share of pixels that are near-black / near-white, and the spread (std dev) of luminance, all 0..1 */
  dark: number;
  light: number;
  spread: number;
};

export type PixelStats = { dark: number; light: number; spread: number };

/** Luminance statistics over a flat RGB byte array. Used to catch blank or mostly black photographs. */
export function pixelStats(rgb: ArrayLike<number>): PixelStats {
  const n = Math.floor(rgb.length / 3);
  if (!n) return { dark: 1, light: 0, spread: 0 };
  let dark = 0, light = 0, sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const y = (0.2126 * rgb[i * 3]! + 0.7152 * rgb[i * 3 + 1]! + 0.0722 * rgb[i * 3 + 2]!) / 255;
    if (y < 0.08) dark++;
    else if (y > 0.95) light++;
    sum += y; sumSq += y * y;
  }
  const mean = sum / n;
  return { dark: dark / n, light: light / n, spread: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
}

export const MIN_LONG_SIDE = 700;
export const MIN_SHORT_SIDE = 300;

/**
 * Why a work should be skipped, or null if it is fine:
 * tiny images, near-blank (white or flat) images, and photographs that are mostly black.
 * `width`/`height` should be the best-known size of the original image.
 */
export function rejectReason(a: { width: number; height: number } & PixelStats): string | null {
  if (Math.max(a.width, a.height) < MIN_LONG_SIDE || Math.min(a.width, a.height) < MIN_SHORT_SIDE) return `tiny image (${a.width}x${a.height})`;
  if (a.dark > 0.85) return "mostly black";
  if (a.light > 0.92) return "mostly blank";
  if (a.spread < 0.03) return "flat / blank";
  return null;
}

/** Decode an image buffer, read its aspect ratio and compute palette, hue/lightness and quality stats. */
export async function analyseImage(buf: Buffer): Promise<ImageAnalysis> {
  const img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const { data } = await img
    .resize(64, 64, { fit: "inside" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const palette = extractPalette(data, 5);
  const accent = accentOf(palette);
  if (!accent || !meta.width || !meta.height) throw new Error("could not analyse image");
  // Dominant = most prominent colour; hue/lightness describe the colourful accent for search.
  return {
    width: meta.width,
    height: meta.height,
    palette,
    dominantColor: palette[0]!.hex,
    hue: accent.h,
    saturation: accent.s,
    lightness: accent.l,
    ...pixelStats(data),
  };
}
