import path from "node:path";
import { defineConfig } from "prisma/config";
import { configDotenv } from "dotenv";

// Prisma CLI doesn't auto-load .env.local — load it explicitly
configDotenv({ path: path.resolve(process.cwd(), ".env.local") });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
