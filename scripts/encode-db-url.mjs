/**
 * Reads DATABASE_URL from .env.local, URL-encodes the password portion,
 * and prints the corrected connection string.
 *
 * Run with: node scripts/encode-db-url.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const content = readFileSync(envPath, "utf8");

const match = content.match(/^DATABASE_URL="(.+)"$/m);
if (!match) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const rawUrl = match[1];

// Parse the URL manually — handles passwords with special chars
const protocolEnd = rawUrl.indexOf("://");
const protocol = rawUrl.slice(0, protocolEnd); // "postgresql"
const rest = rawUrl.slice(protocolEnd + 3);    // "user:pass@host/db"

const atLastIndex = rest.lastIndexOf("@");     // last @ = credential/host separator
const credentials = rest.slice(0, atLastIndex); // "user:pass"
const hostPart = rest.slice(atLastIndex + 1);  // "host/db"

const colonIndex = credentials.indexOf(":");
const user = credentials.slice(0, colonIndex);
const rawPassword = credentials.slice(colonIndex + 1);

const encodedPassword = encodeURIComponent(rawPassword);
const fixedUrl = `${protocol}://${user}:${encodedPassword}@${hostPart}`;

if (fixedUrl === rawUrl) {
  console.log("✓ URL is already correctly encoded — no changes needed.");
  process.exit(0);
}

// Write the fixed URL back into .env.local
const updated = content
  .replace(/^DATABASE_URL="(.+)"$/m, `DATABASE_URL="${fixedUrl}"`)
  .replace(/^DIRECT_DATABASE_URL="(.+)"$/m, `DIRECT_DATABASE_URL="${fixedUrl}"`);

writeFileSync(envPath, updated, "utf8");
console.log("✓ .env.local updated with URL-encoded password.");
console.log("  Encoded URL written (password hidden):");
console.log(`  ${protocol}://${user}:***@${hostPart}`);
