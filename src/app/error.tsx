"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="wrap grid min-h-[60svh] content-center py-20">
      <p className="meta">Something slipped</p>
      <h1 className="display mt-2 max-w-[14ch] text-[clamp(3rem,9vw,7rem)] leading-[0.92] tracking-[-0.03em]">The frame came off the wall.</h1>
      <p className="lede mt-6">That one was on us. You can try again, or head somewhere steadier.</p>
      {error.digest && <p className="meta tnum mt-2">Reference {error.digest}</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={reset}>Try again</button>
        <Link href="/" className="btn btn-quiet">Go home</Link>
      </div>
    </div>
  );
}
