import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config — no Node.js modules, no Prisma adapter.
// Used by proxy.ts (runs on edge). auth.ts extends this with the full config.
export const authConfig = {
  pages: {
    signIn: "/login",
    error:  "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const PUBLIC = ["/", "/login", "/register", "/setup", "/api/auth"];
      const isPublic = PUBLIC.some(
        (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(p + "/"),
      );
      if (isPublic) return true;
      return isLoggedIn;
    },
  },
  providers: [], // providers are added in auth.ts (Node.js runtime only)
} satisfies NextAuthConfig;
