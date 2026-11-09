import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

function safeNext(v: string | undefined) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/me";
}

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if ((await auth())?.user) redirect(next);
  return (
    <div className="wrap grid gap-10 py-20 md:grid-cols-2">
      <div>
        <h1 className="display display-xl max-w-[12ch]">Hang your own walls.</h1>
        <p className="lede mt-5">Sign in to save Chinese works you love, gather them on a wall, and share it with a link. Browsing never needs an account.</p>
      </div>
      <form
        className="self-end"
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: next });
        }}
      >
        <button type="submit" className="btn text-[1.05rem] !min-h-14 !px-6">Continue with GitHub</button>
        <p className="meta mt-3">We read your name and avatar. Nothing is posted on your behalf.</p>
      </form>
    </div>
  );
}
