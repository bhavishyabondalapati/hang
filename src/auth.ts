import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

/**
 * Auth.js v5, GitHub OAuth, database sessions (so every request resolves to a real user row).
 * Config is lazy so `next build` doesn't need a database connection.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [GitHub],
  session: { strategy: "database" as const },
  pages: { signIn: "/signin" },
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
}));
