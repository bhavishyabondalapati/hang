import type { Metadata } from "next";
import { SearchClient, type Filters } from "@/components/SearchClient";
import { searchArtworks } from "@/lib/queries";
import { firstOf, searchInput } from "@/lib/validation";

type SP = Promise<Record<string, string | string[] | undefined>>;

async function parse(sp: SP) {
  const raw = Object.fromEntries(Object.entries(await sp).map(([k, v]) => [k, firstOf(v)]));
  const r = searchInput.safeParse(raw);
  return r.success ? r.data : searchInput.parse({});
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const p = await parse(searchParams);
  return {
    title: p.q ? `“${p.q}”` : "Search",
    description: "Search public-domain art by title, artist, culture, medium, century or colour.",
    alternates: { canonical: "/search" },
    robots: p.q || p.hue !== undefined ? { index: false, follow: true } : undefined,
  };
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const p = await parse(searchParams);
  const result = await searchArtworks({ ...p, page: 1 });
  const filters: Filters = {
    q: p.q ?? "",
    museum: p.museum ?? [],
    medium: p.medium ?? [],
    century: p.century ?? [],
    hue: p.hue ?? null,
    orientation: p.orientation ?? "",
  };
  return <SearchClient initialFilters={filters} initial={result} />;
}
