"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArtCard } from "@/lib/queries";
import { ArtBatch } from "./ArtCardItem";

type Props = {
  initial: ArtCard[];
  initialCursor: string | null;
};

/** Wander feed: appends a new masonry block as the sentinel scrolls into view. Also has a button for keyboard / no-IO users. */
export function InfiniteBatches({ initial, initialCursor }: Props) {
  const [batches, setBatches] = useState<ArtCard[][]>([initial]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const more = useCallback(async () => {
    if (busy.current || !cursor) return;
    busy.current = true; setLoading(true); setError(false);
    try {
      const res = await fetch(`/api/wander?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: ArtCard[]; nextCursor: string | null };
      setBatches((b) => [...b, data.items]);
      setCursor(data.nextCursor);
    } catch {
      setError(true);
    } finally {
      busy.current = false; setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && more(), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, cursor]);

  return (
    <div>
      {batches.map((b, i) => (
        <div key={i} className={i ? "mt-[clamp(10px,1.6vw,22px)]" : ""}>
          <ArtBatch items={b} offset={i} label={i === 0 ? "Artworks" : undefined} />
        </div>
      ))}
      <div ref={sentinel} className="flex min-h-24 items-center justify-center py-8" aria-live="polite">
        {cursor ? (
          <button type="button" className="btn btn-quiet" onClick={more} disabled={loading}>
            {loading ? "Hanging more…" : error ? "Couldn't load. Try again" : "Show more"}
          </button>
        ) : (
          <p className="meta">That is everything for now.</p>
        )}
      </div>
    </div>
  );
}
