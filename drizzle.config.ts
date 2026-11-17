import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const useTls = process.env.DATABASE_SSL?.trim().toLowerCase() === "true";
let dbCredentials: Record<string, unknown>;

if (useTls) {
  const url = new URL(connectionString);
  dbCredentials = {
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "test",
    // mysql2 verifies the server certificate chain; pass its identity option through Drizzle Kit.
    ssl: { rejectUnauthorized: true, verifyIdentity: true } as never,
  };
} else {
  dbCredentials = { url: connectionString };
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: dbCredentials as never,
});
