"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionUser = { name?: string | null; image?: string | null } | null;

/** Reads the session client-side so the pages themselves can stay statically cacheable. */
export function AuthNav() {
  const [user, setUser] = useState<SessionUser | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => live && setUser(s?.user ?? null))
      .catch(() => live && setUser(null));
    return () => { live = false; };
  }, []);

  if (user === undefined) return <span className="w-20" aria-hidden="true" />;
  if (!user) return <Link href="/signin" className="link text-[0.95rem]">Sign in</Link>;
  return (
    <span className="flex items-center gap-4">
      <Link href="/me" className="link text-[0.95rem]">{user.name?.split(" ")[0] ?? "Your walls"}</Link>
      <Link href="/signout" className="text-[0.85rem] text-ink-3 hover:text-ink">Sign out</Link>
    </span>
  );
}
