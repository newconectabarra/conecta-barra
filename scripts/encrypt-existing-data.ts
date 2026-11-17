import { createPool } from "mysql2/promise";
import { sealFields } from "../server/_core/field-encryption";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória.");
if (!process.env.DATA_ENCRYPTION_KEY?.trim()) throw new Error("DATA_ENCRYPTION_KEY é obrigatória; gere com `openssl rand -hex 32`.");

const targets: Array<{ table: string; id: string; fields: string[] }> = [
  { table: "users", id: "id", fields: ["name", "email", "avatarUrl"] },
  { table: "resident_credentials", id: "id", fields: ["address", "cep", "street", "number", "neighborhood", "city", "state", "phone", "email", "complement", "emergencyContact"] },
  { table: "requests", id: "id", fields: ["description", "fullAddress", "cep", "neighborhood", "referencePoint", "photoUrl", "adminMessage"] },
  { table: "request_updates", id: "id", fields: ["message"] },
  { table: "suggestions", id: "id", fields: ["neighborhood", "title", "description", "photoUrl"] },
  { table: "app_notifications", id: "id", fields: ["title", "body", "data"] },
  { table: "email_verification_codes", id: "id", fields: ["email"] },
  { table: "backup_snapshots", id: "id", fields: ["payload"] },
];

function quoteIdentifier(identifier: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) throw new Error(`Identificador inválido: ${identifier}`);
  return `\`${identifier}\``;
}

const url = new URL(databaseUrl);
const pool = createPool({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
  waitForConnections: true,
  connectionLimit: 2,
  ...(process.env.DATABASE_SSL === "true" ? { ssl: { rejectUnauthorized: true, minVersion: "TLSv1.2" } } : {}),
});

try {
  for (const target of targets) {
    const columns = [target.id, ...target.fields, "encryptedData"].map(quoteIdentifier).join(", ");
    const [rows] = await pool.query(`SELECT ${columns} FROM ${quoteIdentifier(target.table)} WHERE encryptedData IS NULL LIMIT 10000`);
    let migrated = 0;
    for (const row of rows as Array<Record<string, unknown>>) {
      const fields = Object.fromEntries(target.fields.map((field) => [field, row[field] == null ? null : String(row[field])]));
      const encryptedData = sealFields(fields);
      await pool.execute(`UPDATE ${quoteIdentifier(target.table)} SET encryptedData = ? WHERE ${quoteIdentifier(target.id)} = ? AND encryptedData IS NULL`, [encryptedData, String(row[target.id])]);
      migrated += 1;
    }
    console.log(`[field-encryption] ${target.table}: ${migrated} registro(s) cifrado(s)`);
  }
  console.log("[field-encryption] Migração concluída. A remoção do legado só deve ocorrer depois do cutover de leitura.");
} finally {
  await pool.end();
}
