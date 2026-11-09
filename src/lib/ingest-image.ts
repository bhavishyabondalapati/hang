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
};

/** Decode an image buffer, read its aspect ratio and compute palette + hue/lightness. */
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
  };
}
