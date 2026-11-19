import "./load-env.js";
import { randomBytes } from "node:crypto";
import * as db from "../server/db";
import { hashPassword } from "../server/auth-helpers";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
function password() {
  const bytes = randomBytes(24);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}
function slug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 42);
}

async function main() {
  const neighborhoods = await db.listNeighborhoods(true);
  const output: Array<{ neighborhood: string; username: string; password: string; status: "criada" | "existente" }> = [];
  for (const neighborhood of neighborhoods) {
    const username = `presidente.${slug(neighborhood.name)}`.slice(0, 64);
    const existing = await db.getResidentCredentialByUsername(username);
    if (existing) {
      output.push({ neighborhood: neighborhood.name, username, password: "(senha já existente — não alterada)", status: "existente" });
      continue;
    }
    const openId = `admin_bairro_${slug(neighborhood.name)}`;
    await db.upsertUser({ openId, name: `Presidente — ${neighborhood.name}`, loginMethod: "local-neighborhood-admin", role: "admin", residentStatus: "approved", lastSignedIn: new Date() });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error(`Não foi possível criar o usuário administrativo de ${neighborhood.name}.`);
    const clearPassword = password();
    await db.createResidentCredential({ userId: user.id, username, passwordHash: await hashPassword(clearPassword), address: `Administração do bairro ${neighborhood.name}`, neighborhood: neighborhood.name, phone: "00000000000", sex: "prefer_not_to_say", email: null, emailVerifiedAt: new Date() });
    output.push({ neighborhood: neighborhood.name, username, password: clearPassword, status: "criada" });
  }
  console.log(JSON.stringify(output, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
