#!/usr/bin/env node
/**
 * Confere se as tabelas do Conecta Barra já existem no banco (somente leitura).
 *   npm run db:check
 * Use no lugar de rodar `npm run db:push` de novo: no TiDB o db:push só deve ser executado UMA vez
 * (a segunda execução tenta recriar chaves primárias e reclama, mesmo com as tabelas corretas).
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida (.env ou ambiente)."); process.exit(1); }

const expected = [...fs.readFileSync("drizzle/schema.ts", "utf8").matchAll(/mysqlTable\("([a-z_]+)"/g)].map((m) => m[1]);
const u = new URL(url);
const conn = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: decodeURIComponent(u.pathname.replace(/^\/+/, "")) || "test",
  ssl: process.env.DATABASE_SSL?.toLowerCase() === "true" ? { rejectUnauthorized: true, minVersion: "TLSv1.2" } : undefined,
});
const [rows] = await conn.query("SHOW TABLES");
const existing = new Set(rows.map((r) => Object.values(r)[0]));
await conn.end();
const missing = expected.filter((t) => !existing.has(t));
console.log(`Tabelas esperadas: ${expected.length} | encontradas: ${expected.length - missing.length}`);
if (missing.length) { console.error("FALTAM:", missing.join(", "), "\n→ rode `npm run db:push` (uma vez)."); process.exit(1); }
console.log("OK: todas as tabelas existem. NÃO rode db:push de novo.");
