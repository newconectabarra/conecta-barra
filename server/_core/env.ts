function required(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    console.warn(`[env] Variável ${name} não definida.`);
    return "";
  }
  return value;
}

/** Tira espaços, quebras de linha e aspas que costumam vir junto ao colar um valor no painel de hospedagem. */
function cleanSecret(value: string | undefined) {
  return (value ?? "").trim().replace(/^(["'])(.*)\1$/s, "$2").trim();
}

function flag(name: string, defaultValue: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "sim", "yes", "on"].includes(raw);
}

const isProduction = process.env.NODE_ENV === "production";
const jwt = required("JWT_SECRET", isProduction ? undefined : "dev-only-secret-change-me");
if (isProduction && jwt.length < 32) {
  throw new Error("JWT_SECRET precisa ter pelo menos 32 caracteres em produção. Gere com: openssl rand -hex 32 (veja GUIA-DE-IMPLANTACAO.md, passo 5).");
}
const dataEncryptionKey = process.env.DATA_ENCRYPTION_KEY?.trim() ?? "";
if (isProduction && !dataEncryptionKey) {
  throw new Error("DATA_ENCRYPTION_KEY precisa ser configurada em produção antes de iniciar a API. Gere com: openssl rand -hex 32 (veja GUIA-DE-IMPLANTACAO.md, passo 5).");
}

const publicUrl = process.env.PUBLIC_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || "";

/**
 * IMPORTANTE (versão 2.0): NENHUM valor de conta real fica gravado no código-fonte.
 * Tudo vem de variáveis de ambiente configuradas no servidor de hospedagem (veja GUIA-DE-IMPLANTACAO.md).
 */
export const ENV = {
  isProduction,
  cookieSecret: jwt,
  dataEncryptionKey,
  databaseUrl: required("DATABASE_URL"),
  databaseSsl: process.env.DATABASE_SSL?.trim().toLowerCase() === "true",
  /** URL pública do backend. No Render, usa automaticamente RENDER_EXTERNAL_URL. */
  publicUrl: publicUrl.replace(/\/$/, ""),
  /** Origens de navegador autorizadas (separadas por vírgula). O app nativo não precisa. */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim().replace(/\/$/, "")).filter(Boolean),
  cookieDomain: process.env.COOKIE_DOMAIN?.trim() || undefined,
  /** Usuário e senha da gestão. Sem os dois, o login administrativo fica desativado (e o servidor avisa nos logs). */
  adminUsername: cleanSecret(process.env.ADMIN_USERNAME).replace(/^@+/, ""),
  adminPassword: cleanSecret(process.env.ADMIN_PASSWORD),
  /** true = ignora a senha trocada dentro do app e volta a valer ADMIN_PASSWORD (recuperação se a senha for esquecida). */
  adminForceEnvPassword: flag("ADMIN_FORCE_ENV_PASSWORD", false),
  /** Novos cadastros ficam "pendentes" até a gestão aprovar (REQUIRE_RESIDENT_APPROVAL=true). Padrão: aprovados na hora. */
  requireResidentApproval: flag("REQUIRE_RESIDENT_APPROVAL", false),
  /**
   * Exigir confirmação por código de e-mail no cadastro. Padrão: SIM quando há provedor de e-mail configurado.
   * Sem provedor de e-mail, o cadastro funciona sem confirmação (e /api/health/config avisa).
   */
  requireEmailVerification: flag("REQUIRE_EMAIL_VERIFICATION", true),
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN?.trim() ?? "",
  /** Cliente OAuth "Aplicativo da Web" do Google (opcional — só para o botão "Continuar com Google"). */
  googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID?.trim() ?? "",
  googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID?.trim() ?? "",
  googleWebClientSecret: cleanSecret(process.env.GOOGLE_WEB_CLIENT_SECRET),
  /** Opcional: força o redirect URI do Google. Padrão: <URL pública>/api/auth/google/callback. */
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() ?? "",
  /** Chave de conta de serviço do Firebase (JSON ou JSON em base64) para enviar push direto pelo FCM (gratuito). */
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ?? "",
  whatsappUrl: process.env.OFFICIAL_WHATSAPP_URL?.trim() ?? "",
};
