"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MEDIUM_GROUPS, MUSEUMS, SOURCES, centuryLabel, type Source } from "@/lib/artwork";
import { HUE_SWATCHES } from "@/lib/color";
import type { ArtCard } from "@/lib/queries";
import { ArtBatch } from "./ArtCardItem";

export type Filters = {
  q: string;
  museum: string[];
  medium: string[];
  century: number[];
  hue: number | null;
  orientation: "" | "landscape" | "portrait" | "square";
};

const CENTURIES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const centuryChip = (c: number) => (c === 12 ? "Before 1300" : centuryLabel(c));

export function toQuery(f: Filters, page = 1): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.museum.length) p.set("museum", f.museum.join(","));
  if (f.medium.length) p.set("medium", f.medium.join(","));
  if (f.century.length) p.set("century", f.century.join(","));
  if (f.hue !== null) p.set("hue", String(f.hue));
  if (f.orientation) p.set("orientation", f.orientation);
  if (page > 1) p.set("page", String(page));
  return p.toString();
}

type Result = { items: ArtCard[]; total: number; page: number; hasMore: boolean };

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function SearchClient({ initialFilters, initial }: { initialFilters: Filters; initial: Result }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState<Filters>(initialFilters);
  const [batches, setBatches] = useState<ArtCard[][]>([initial.items]);
  const [meta, setMeta] = useState({ total: initial.total, page: initial.page, hasMore: initial.hasMore });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const first = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Whenever filters change: sync the URL (shareable) and fetch page 1. Text input is debounced.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      const qs = toQuery(f);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      abort.current?.abort();
      const ac = (abort.current = new AbortController());
      setLoading(true); setError(false);
      try {
        const res = await fetch(`/api/search?${qs}`, { signal: ac.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Result;
        setBatches([data.items]);
        setMeta({ total: data.total, page: 1, hasMore: data.hasMore });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        if (abort.current === ac) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [f, pathname, router]);

  const loadMore = useCallback(async () => {
    if (loading || !meta.hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?${toQuery(f, meta.page + 1)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Result;
      setBatches((b) => [...b, data.items]);
      setMeta({ total: data.total, page: data.page, hasMore: data.hasMore });
    } catch { setError(true); } finally { setLoading(false); }
  }, [f, loading, meta]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !meta.hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && loadMore(), { rootMargin: "700px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, meta.hasMore]);

  const active = f.museum.length + f.medium.length + f.century.length + (f.hue !== null ? 1 : 0) + (f.orientation ? 1 : 0) + (f.q ? 1 : 0);
  const clear = () => setF({ q: "", museum: [], medium: [], century: [], hue: null, orientation: "" });

  return (
    <div className="wrap pb-10">
      <h1 className="display display-xl pt-6">Search</h1>
      <form role="search" className="mt-6" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="q" className="sr-only">Search title, artist, culture or medium</label>
        <input
          id="q" type="search" autoComplete="off" spellCheck={false} enterKeyHint="search"
          className="field !text-[clamp(1.25rem,3vw,2rem)] !font-[family-name:var(--font-display)] !min-h-16"
          placeholder="Try “van gogh”, “kimono”, “night”…"
          value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
        />
      </form>

      <fieldset className="mt-6">
        <legend className="meta mb-2">Colour</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by dominant hue">
          {HUE_SWATCHES.map((s) => {
            const on = f.hue === s.hue;
            return (
              <button
                key={s.hue} type="button" aria-pressed={on} aria-label={`${s.name} hue`} title={s.name}
                onClick={() => setF({ ...f, hue: on ? null : s.hue })}
                className="h-11 w-11 cursor-pointer border-0 transition-transform hover:scale-105 focus-visible:scale-105 sm:h-12 sm:w-12"
                style={{ background: s.hex, boxShadow: on ? "0 0 0 3px var(--paper), 0 0 0 5px var(--ink)" : undefined }}
              />
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <ChipGroup label="Museum">
          {SOURCES.map((s) => <Chip key={s} on={f.museum.includes(s)} onClick={() => setF({ ...f, museum: toggle(f.museum, s) })}>{MUSEUMS[s as Source].short}</Chip>)}
        </ChipGroup>
        <ChipGroup label="Medium">
          {MEDIUM_GROUPS.filter((m) => m !== "Other").map((m) => <Chip key={m} on={f.medium.includes(m)} onClick={() => setF({ ...f, medium: toggle(f.medium, m) })}>{m}</Chip>)}
        </ChipGroup>
        <ChipGroup label="Century">
          {CENTURIES.map((c) => <Chip key={c} on={f.century.includes(c)} onClick={() => setF({ ...f, century: toggle(f.century, c) })}>{centuryChip(c)}</Chip>)}
        </ChipGroup>
        <ChipGroup label="Orientation">
          {(["landscape", "portrait", "square"] as const).map((o) => <Chip key={o} on={f.orientation === o} onClick={() => setF({ ...f, orientation: f.orientation === o ? "" : o })}>{o[0]!.toUpperCase() + o.slice(1)}</Chip>)}
        </ChipGroup>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3" aria-live="polite">
        <p className="meta tnum" data-testid="result-count">
          {loading && !batches[0]?.length ? "Searching…" : `${meta.total.toLocaleString("en-US")} ${meta.total === 1 ? "work" : "works"}`}
        </p>
        {active > 0 && <button type="button" className="btn btn-text" onClick={clear}>Clear all filters</button>}
      </div>

      <div className={`mt-4 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`}>
        {batches[0]?.length ? (
          batches.map((b, i) => <div key={i} className={i ? "mt-[clamp(10px,1.6vw,22px)]" : ""}><ArtBatch items={b} offset={i} label={i === 0 ? "Results" : undefined} /></div>)
        ) : !loading ? (
          <div className="py-16">
            <p className="display display-l max-w-[20ch]">Nothing hangs here yet.</p>
            <p className="lede mt-3">Try a shorter search, or loosen a filter.</p>
          </div>
        ) : null}
      </div>
      {error && <p role="alert" className="mt-4 text-[0.95rem]">Couldn&rsquo;t load results. Check your connection and try again.</p>}
      <div ref={sentinel} className="flex min-h-20 items-center justify-center">
        {meta.hasMore && <button type="button" className="btn btn-quiet" onClick={loadMore} disabled={loading}>{loading ? "Loading…" : "Show more"}</button>}
      </div>
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="meta mb-2">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}
