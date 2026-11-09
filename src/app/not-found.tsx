import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap grid min-h-[60svh] content-center gap-8 py-20 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <p className="meta">404</p>
        <h1 className="display mt-2 text-[clamp(3rem,10vw,8rem)] leading-[0.9] tracking-[-0.03em]">Nothing is hanging here.</h1>
        <p className="lede mt-6">The page has been taken down, or the link was never quite right.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn">Back to wandering</Link>
          <Link href="/search" className="btn btn-quiet">Search the collection</Link>
        </div>
      </div>
      {/* an empty frame, hung and waiting */}
      <div className="hidden h-56 w-44 border-[10px] border-ink bg-paper-2 p-4 md:block" aria-hidden="true">
        <div className="h-full w-full bg-paper-3" />
      </div>
    </div>
  );
}
