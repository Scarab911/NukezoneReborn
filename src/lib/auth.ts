import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { z } from "zod";

const CredentialsSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  providers: [
    Discord({
      clientId:     process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),

    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const player = await prisma.player.findUnique({
          where: { email: parsed.data.email },
        });
        if (!player?.passwordHash) return null;

        const { compare } = await import("bcryptjs");
        const valid = await compare(parsed.data.password, player.passwordHash);
        if (!valid) return null;

        return { id: player.id, email: player.email, name: player.name };
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user }) {
      if (user) {
        token.playerId = user.id;
        const player = await prisma.player.findUnique({
          where: { id: user.id },
          select: {
            role:   true,
            nation: { select: { id: true, worldId: true } },
          },
        });
        token.role     = player?.role;
        token.nationId = player?.nation?.id ?? null;
        token.worldId  = player?.nation?.worldId ?? null;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id       = token.playerId as string;
      session.user.role     = token.role as string;
      session.user.nationId = token.nationId as string | null;
      session.user.worldId  = token.worldId  as string | null;
      return session;
    },
  },
});
