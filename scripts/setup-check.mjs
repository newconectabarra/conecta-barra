#!/usr/bin/env node
/**
 * Lista TODAS as contas/repositórios que precisam existir para o Conecta Barra funcionar por completo
 * e confere o que já está configurado neste computador.
 *
 *   npm run setup:check                 → mostra a lista e o que falta (não interrompe)
 *   node scripts/setup-check.mjs --strict [--profile preview]   → igual, mas sai com erro se faltar algo obrigatório
 *
 * Nenhuma conta é "pré-configurada": se um valor ainda for o texto "COLOQUE-AQUI…", ele conta como faltando.
 */
import fs from "node:fs";
import path from "node:path";

const strict = process.argv.includes("--strict");
const profileIndex = process.argv.indexOf("--profile");
const profile = profileIndex > -1 ? process.argv[profileIndex + 1] : "preview";

// .env local (opcional)
const env = { ...process.env };
const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
// eas.json → env do perfil
try {
  const eas = JSON.parse(fs.readFileSync("eas.json", "utf8"));
  const base = eas.build?.base?.env ?? {};
  const prof = eas.build?.[profile]?.env ?? {};
  for (const [k, v] of Object.entries({ ...base, ...prof })) if (!env[k]) env[k] = String(v);
} catch { /* sem eas.json */ }

const isPlaceholder = (v) => !v || /^(COLOQUE|SEU|SUA|TROQUE|PREENCHA|<|\.\.\.)/i.test(String(v).trim());
const has = (k) => !isPlaceholder(env[k]);

const checks = [
  { ok: has("EXPO_PUBLIC_API_URL") && /^https:\/\//i.test(env.EXPO_PUBLIC_API_URL), required: true, text: "EXPO_PUBLIC_API_URL  → endereço HTTPS do seu servidor (eas.json → build → base → env)" },
  { ok: has("EXPO_PUBLIC_EAS_PROJECT_ID") && /^[0-9a-f-]{36}$/i.test(env.EXPO_PUBLIC_EAS_PROJECT_ID), required: true, text: "EXPO_PUBLIC_EAS_PROJECT_ID  → ID do projeto Expo (rode `eas init`; eas.json → build → base → env)" },
  { ok: fs.existsSync("google-services.json") || has("GOOGLE_SERVICES_JSON"), required: true, text: "google-services.json  → arquivo do SEU projeto Firebase, na raiz do projeto (notificações push)" },
];

const accounts = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  CONECTA BARRA 2.0 — CONTAS E REPOSITÓRIOS QUE VOCÊ PRECISA CRIAR            ║
║  (todas gratuitas e sem cartão de crédito — passo a passo no GUIA-DE-IMPLANTACAO.md) ║
╚══════════════════════════════════════════════════════════════════════════════╝
 1. GitHub ........ github.com ............ 1 repositório com ESTE código (o Render lê dele) + keep-alive
 2. TiDB Cloud .... tidbcloud.com ......... banco de dados MySQL (5 GiB grátis)            → DATABASE_URL
 3. Render ........ render.com ............ servidor (API + tempo real), plano Free       → PUBLIC_URL
 4. Brevo ......... brevo.com ............. e-mails (300/dia grátis): confirmação/senha   → BREVO_API_KEY
 5. Firebase ...... console.firebase.google.com  notificações push (FCM, grátis)           → google-services.json
                                                                                          → FIREBASE_SERVICE_ACCOUNT_JSON
 6. Expo (EAS) .... expo.dev .............. compila o APK na nuvem (cota mensal grátis)   → EXPO_PUBLIC_EAS_PROJECT_ID
 7. cron-job.org .. cron-job.org .......... (opcional) mantém o servidor grátis acordado
 8. Google Cloud .. console.cloud.google.com (opcional) botão "Continuar com Google"       → GOOGLE_WEB_CLIENT_ID/SECRET

 ONDE CADA COISA É HOSPEDADA:
   • Código-fonte ........................ GitHub
   • API + WebSocket (pasta server/) ..... Render (Web Service, Node)
   • Dados e fotos ....................... TiDB Cloud (as fotos ficam no próprio banco)
   • E-mails ............................. Brevo (via API HTTPS; o Render Free bloqueia SMTP)
   • Push ................................ Firebase Cloud Messaging
   • APK (app Android) ................... compilado no Expo EAS e instalado nos celulares
`;
console.log(accounts);
console.log(` CONFERÊNCIA NESTE COMPUTADOR (perfil de compilação: ${profile}):`);
let missingRequired = 0;
for (const c of checks) {
  console.log(`   ${c.ok ? "[OK]    " : "[FALTA] "} ${c.text}`);
  if (!c.ok && c.required) missingRequired += 1;
}
console.log("\n Variáveis que vão no SERVIDOR (Render → Environment), NÃO no app: DATABASE_URL, JWT_SECRET, DATA_ENCRYPTION_KEY,");
console.log(" ADMIN_USERNAME, ADMIN_PASSWORD, BREVO_API_KEY, BREVO_SENDER_EMAIL, ADMIN_NOTIFICATION_EMAIL, FIREBASE_SERVICE_ACCOUNT_JSON.");
console.log(" Depois de publicar o servidor, abra  https://SEU-SERVIDOR/api/health/config  para ver o que ainda falta.\n");

if (missingRequired > 0) {
  console.log(` ✖ Faltam ${missingRequired} item(ns) obrigatório(s) para compilar o app.`);
  if (strict) process.exit(1);
} else {
  console.log(" ✔ Configuração do app completa para compilar.");
}
