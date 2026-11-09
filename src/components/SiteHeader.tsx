import Link from "next/link";
import { AuthNav } from "./AuthNav";
import { ThemeToggle } from "./ThemeToggle";

const nav = [
  { href: "/", label: "Wander" },
  { href: "/search", label: "Search" },
  { href: "/me", label: "Walls" },
];

export function SiteHeader() {
  return (
    <header className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
      <Link href="/" className="display text-[1.7rem] leading-none no-underline" aria-label="Hang, home">
        Hang
      </Link>
      <nav aria-label="Primary" className="order-3 flex w-full items-center gap-6 sm:order-none sm:w-auto">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="link text-[0.95rem] no-underline py-2">{n.label}</Link>
        ))}
      </nav>
      <div className="flex items-center gap-4">
        <AuthNav />
        <ThemeToggle />
      </div>
    </header>
  );
}
