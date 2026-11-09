import { ImageResponse } from "next/og";
import { getWallBySlug } from "@/lib/queries";

export const alt = "A wall on Hang";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const THEMES = {
  plaster: { bg: "#cfc6b4", ink: "#17140f", frame: "#1b1712" },
  "gallery-white": { bg: "#efeee9", ink: "#1a1915", frame: "#0f0f0e" },
  night: { bg: "#1a1d22", ink: "#ece8dd", frame: "#b79a62" },
} as const;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Only public walls get a rich preview; a private wall's title is never leaked.
  const data = await getWallBySlug(slug, null);
  const t = THEMES[data?.wall.theme ?? "plaster"];
  const shown = (data?.items ?? []).slice(0, 4);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: t.bg, color: t.ink, padding: 64 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 36, height: 340 }}>
          {shown.map((it) => {
            const r = Math.min(Math.max((it.width ?? 4) / (it.height ?? 5), 0.6), 1.8);
            return (
              <div key={it.id} style={{ display: "flex", border: `10px solid ${t.frame}`, background: "#f1ede3", padding: 12, boxShadow: "0 14px 24px rgba(0,0,0,.35)" }}>
                <img src={it.imageSmall} width={Math.round(300 * r)} height={300} alt="" style={{ objectFit: "cover" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, lineHeight: 1.05, fontWeight: 600, maxWidth: 840 }}>{data?.wall.title ?? "Hang"}</div>
            <div style={{ fontSize: 28, marginTop: 10, opacity: 0.75 }}>
              {data ? `${data.items.length} works, hung by ${data.owner.name ?? "a curator"}` : "Chinese art to look at, then hang."}
            </div>
          </div>
          <div style={{ fontSize: 54, fontWeight: 600 }}>Hang</div>
        </div>
      </div>
    ),
    size,
  );
}
