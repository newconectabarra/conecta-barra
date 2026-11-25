import * as db from "./db";

import { hashPassword } from "./auth-helpers";

import { existsSync, readFileSync } from "fs";



/**

 * Provisionamento temporário controlado por segredo do ambiente.

 * O JSON nunca deve ser commitado: é fornecido somente como variável secreta do Render.

 * Contas já existentes não têm a senha sobrescrita.

 */

type ProvisionedAccount = {
  
  neighborhood: string;
  
  username: string;
  
  password: string;
  
};



function slug(value: string) {
  
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 42);
  
}



export async function provisionNeighborhoodAdminsFromEnv() {
  
  const secretFile = "/etc/secrets/neighborhood-admin-credentials.json";
  
  const raw = (process.env.NEIGHBORHOOD_ADMIN_CREDENTIALS_JSON?.trim() || (existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : ""));
  
  if (!raw) return { enabled: false, created: 0, existing: 0 };
  

  
  let accounts: ProvisionedAccount[];
  
  try {
    
    const parsed: unknown = JSON.parse(raw);
    
    if (!Array.isArray(parsed)) throw new Error("o valor precisa ser uma lista");
    
    accounts = parsed.map((item, index) => {
      
      if (!item || typeof item !== "object") throw new Error(`item ${index + 1} inválido`);
      
      const row = item as Record<string, unknown>;
      
      const neighborhood = typeof row.neighborhood === "string" ? row.neighborhood.trim() : "";
      
      const username = typeof row.username === "string" ? row.username.trim().toLowerCase() : "";
      
      const password = typeof row.password === "string" ? row.password : "";
      
      if (!neighborhood || !username || !password) throw new Error(`item ${index + 1} incompleto`);
      
      return { neighborhood, username, password };
      
    });
    
  } catch (error) {
    
    throw new Error(`NEIGHBORHOOD_ADMIN_CREDENTIALS_JSON inválido: ${error instanceof Error ? error.message : String(error)}`);
    
  }
  

  
  let created = 0;
  
  let existing = 0;
  
  for (const account of accounts) {
    
    const current = await db.getResidentCredentialByUsername(account.username);
    
    if (current) {
      
      existing += 1;
      
      continue;
      
    }
    
    const openId = `admin_bairro_${slug(account.neighborhood)}`;
    
    await db.upsertUser({
      
      openId,
      
      name: `Presidente — ${account.neighborhood}`,
      
      loginMethod: "local-neighborhood-admin",
      
      role: "admin",
      
      residentStatus: "approved",
      
      lastSignedIn: new Date(),
      
    });
    
    const user = await db.getUserByOpenId(openId);
    
    if (!user) throw new Error(`não foi possível criar a conta de ${account.neighborhood}`);
    
    await db.createResidentCredential({
      
      userId: user.id,A
      
      username: account.username,
      
      passwordHash: await hashPassword(account.password),
      
      address: `Administração do bairro ${account.neighborhood}`,
      
      neighborhood: account.neighborhood,
      
      phone: "00000000000",
      
      sex: "prefer_not_to_say",
      
      email: null,
      
      emailVerifiedAt: new Date(),
      
    });
    
    created += 1;
    
  }
  
  console.log(`[Provisionamento] contas administrativas por bairro: ${created} criadas, ${existing} já existentes.`);
  
  return { enabled: true, created, existing };
  
}

A





























































