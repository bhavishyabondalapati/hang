/** A 1x1 SVG data URL in the artwork's dominant colour, used as next/image's blur placeholder. */
export function blurFor(hex: string | null | undefined): string {
  const c = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#d8d3c6";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'><rect width='1' height='1' fill='${c}'/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function altFor(a: { title: string; artist: string | null; date: string | null }): string {
  return [a.title, a.artist && `by ${a.artist}`, a.date && `(${a.date})`].filter(Boolean).join(" ");
}

export function artHref(id: string) {
  return `/art/${id}`;
}

/** view-transition-name must be a valid CSS identifier. */
export function vtName(id: string) {
  return `art-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
