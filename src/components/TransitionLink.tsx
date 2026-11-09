"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";

type Nav = (href: string, thumb: HTMLElement | null, name: string) => void;
const Ctx = createContext<Nav | null>(null);

/**
 * Shared-element transition from a grid thumbnail to the detail image, using the View Transitions API.
 * We name the clicked thumbnail, start a transition, and resolve it once the new route has rendered
 * (the detail page's hero image carries the same view-transition-name).
 * Browsers without the API, and users who prefer reduced motion, just navigate normally.
 */
export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    // New route committed: let the browser snapshot the "after" state on the next frame.
    if (pending.current) {
      const done = pending.current;
      pending.current = null;
      requestAnimationFrame(() => requestAnimationFrame(done));
    }
  }, [pathname]);

  const go = useCallback<Nav>((href, thumb, name) => {
    const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduce || !thumb) return router.push(href);
    thumb.style.viewTransitionName = name;
    const t = doc.startViewTransition(
      () => new Promise<void>((resolve) => {
        pending.current = resolve;
        router.push(href);
        setTimeout(() => { if (pending.current === resolve) { pending.current = null; resolve(); } }, 1500);
      }),
    );
    t.finished.finally(() => { thumb.style.viewTransitionName = ""; });
  }, [router]);

  return <Ctx.Provider value={go}>{children}</Ctx.Provider>;
}

export function TransitionLink({
  href, name, className, children, ...rest
}: { href: string; name: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  const go = useContext(Ctx);
  return (
    <Link
      href={href}
      className={className}
      {...rest}
      onClick={(e) => {
        if (!go || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        const thumb = (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-vt]");
        go(href, thumb, name);
      }}
    >
      {children}
    </Link>
  );
}
