import type { Metadata } from "next";
import { signOut } from "@/auth";

export const metadata: Metadata = { title: "Sign out", robots: { index: false } };

export default function SignOut() {
  return (
    <div className="wrap py-20">
      <h1 className="display display-xl max-w-[12ch]">Leaving already?</h1>
      <form
        className="mt-8"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" className="btn">Sign out</button>
      </form>
    </div>
  );
}
