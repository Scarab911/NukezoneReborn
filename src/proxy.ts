import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Uses only the edge-safe config — no Node.js crypto, no Prisma.
// Full auth (with adapter) lives in src/auth.ts and runs in Node.js routes/layouts.
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
