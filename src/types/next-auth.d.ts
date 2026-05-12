import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id:       string;
      role:     string;
      nationId: string | null;
      worldId:  string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    playerId: string;
    role:     string;
    nationId: string | null;
    worldId:  string | null;
  }
}
