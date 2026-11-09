import { MUSEUMS } from "@/lib/artwork";

export function SiteFooter() {
  return (
    <footer className="wrap mt-24 pb-10 pt-10">
      <p className="display text-[clamp(3.5rem,13vw,11rem)] leading-[0.85] tracking-[-0.04em] text-ink">Hang</p>
      <div className="mt-8 grid gap-6 text-[0.92rem] text-ink-2 md:grid-cols-[1.4fr_1fr]">
        <p className="max-w-[52ch]">
          A collection of Chinese art. Every image is a public-domain work (CC0) from{" "}
          {Object.values(MUSEUMS).map((m, i) => (
            <span key={m.name}>
              {i > 0 && (i === 2 ? ", and " : ", ")}
              <a className="link" href={m.url} rel="noopener noreferrer" target="_blank">{m.name}</a>
            </span>
          ))}
          . Image rights stay with the public; credit lines belong to the museums.
        </p>
        <p className="md:text-right">A small project for looking slowly at Chinese art.</p>
      </div>
    </footer>
  );
}
