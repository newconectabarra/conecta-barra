import { ENV } from "./env";
import { emailProvider, emailSender } from "../email";
import { fcmConfigured } from "../fcm";
import { googleWebFlowConfigured } from "../google-oauth";

export type ConfigItem = {
  key: string;
  label: string;
  /** "required" = o app não funciona sem isso; "recommended" = funciona, mas perde recurso; "optional" = extra. */
  level: "required" | "recommended" | "optional";
  ok: boolean;
  /** Onde criar/configurar (texto curto; o passo a passo completo está no GUIA-DE-IMPLANTACAO.md). */
  how: string;
};

/** Verifica (sem expor segredos) o que já está configurado neste servidor. */
export function configItems(databaseOk: boolean): ConfigItem[] {
  return [
    { key: "database", label: "Banco de dados MySQL/TiDB", level: "required", ok: databaseOk && Boolean(ENV.databaseUrl), how: "Crie o banco no TiDB Cloud (grátis) e cole a conexão em DATABASE_URL — guia, passo 3. Depois rode `npm run db:push`." },
    { key: "jwt", label: "JWT_SECRET (≥ 32 caracteres)", level: "required", ok: ENV.cookieSecret.length >= 32, how: "Gere com `openssl rand -hex 32` — guia, passo 5." },
    { key: "encryption", label: "DATA_ENCRYPTION_KEY", level: "required", ok: Boolean(ENV.dataEncryptionKey), how: "Gere com `openssl rand -hex 32`. NUNCA troque depois que houver dados — guia, passo 5." },
    { key: "admin", label: "ADMIN_USERNAME + ADMIN_PASSWORD (login da gestão)", level: "required", ok: Boolean(ENV.adminUsername && ENV.adminPassword), how: "Defina um usuário e uma senha forte nas variáveis do servidor — guia, passo 5." },
    { key: "publicUrl", label: "PUBLIC_URL (endereço público do servidor)", level: "recommended", ok: Boolean(ENV.publicUrl), how: "No Render é preenchido sozinho (RENDER_EXTERNAL_URL). Em outro host, defina PUBLIC_URL=https://seu-servidor — guia, passo 4." },
    { key: "email", label: `E-mail transacional (${emailProvider() === "none" ? "não configurado" : emailProvider()})`, level: "recommended", ok: emailProvider() !== "none" && Boolean(emailSender()), how: "Crie conta grátis na Brevo, valide o remetente e defina BREVO_API_KEY + BREVO_SENDER_EMAIL — guia, passo 6. Sem isso: cadastro sem confirmação por e-mail e sem 'esqueci a senha'." },
    { key: "fcm", label: "Push (Firebase Cloud Messaging)", level: "recommended", ok: fcmConfigured(), how: "Crie o projeto no Firebase, gere a chave de conta de serviço e cole em FIREBASE_SERVICE_ACCOUNT_JSON — guia, passo 7. Sem isso: sem notificações no celular." },
    { key: "google", label: "Login com Google", level: "optional", ok: googleWebFlowConfigured(), how: "Opcional. Crie o cliente OAuth 'Aplicativo da Web' no Google Cloud — guia, passo 8." },
  ];
}

/** Imprime no log de inicialização o que falta configurar, com instruções. */
export function printConfigReport(databaseOk: boolean) {
  const items = configItems(databaseOk);
  const missing = items.filter((item) => !item.ok);
  console.log("[config] ─── Verificação de configuração do servidor ───");
  for (const item of items) console.log(`[config] ${item.ok ? "OK      " : item.level === "required" ? "FALTA   " : item.level === "recommended" ? "ATENÇÃO " : "opcional"} ${item.label}`);
  for (const item of missing) console.warn(`[config] → ${item.label}: ${item.how}`);
  if (missing.some((item) => item.level === "required")) console.error("[config] Há itens OBRIGATÓRIOS faltando. O app NÃO funcionará por completo. Siga o GUIA-DE-IMPLANTACAO.md.");
  console.log("[config] Diagnóstico sem segredos: abra /api/health/config no navegador.");
}
