import { SignJWT, importPKCS8 } from "jose";
import { ENV } from "./_core/env";

/**
 * Envio de push DIRETO pelo Firebase Cloud Messaging (API HTTP v1). É gratuito (plano Spark do Firebase),
 * não depende do Expo Push Service e não exige conta paga em nenhum serviço.
 * Precisa apenas da chave de conta de serviço do MESMO projeto Firebase do google-services.json.
 */

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let account: ServiceAccount | null | undefined;
let cachedToken: { value: string; expires: number } | null = null;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  account = null;
  const raw = ENV.firebaseServiceAccount;
  if (!raw) return account;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(text) as Partial<ServiceAccount>;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      account = { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
    } else {
      console.warn("[fcm] FIREBASE_SERVICE_ACCOUNT_JSON incompleto (faltam project_id, client_email ou private_key).");
    }
  } catch (error) {
    console.warn("[fcm] FIREBASE_SERVICE_ACCOUNT_JSON inválido (não é JSON nem JSON em base64):", (error as Error).message);
  }
  return account;
}

export function fcmConfigured() {
  return Boolean(loadAccount());
}

export function fcmProjectId() {
  return loadAccount()?.project_id ?? null;
}

async function accessToken(forceRefresh = false): Promise<string> {
  const sa = loadAccount();
  if (!sa) throw new Error("FcmNotConfigured");
  if (!forceRefresh && cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn(`[fcm] não obteve token OAuth (${response.status}): ${detail.slice(0, 200)}`);
    throw new Error("FcmAuthError");
  }
  const body = (await response.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

export type FcmResult = { ok: true } | { ok: false; code: string; invalidToken: boolean };

export type FcmNotice = { title: string; body: string; data?: Record<string, unknown> };

function stringifyData(data: Record<string, unknown> | undefined) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) if (value !== undefined && value !== null) out[key] = String(value);
  return out;
}

export async function sendFcm(token: string, notice: FcmNotice): Promise<FcmResult> {
  const sa = loadAccount();
  if (!sa) return { ok: false, code: "FcmNotConfigured", invalidToken: false };
  const flat = stringifyData(notice.data);
  const message = {
    message: {
      token,
      notification: { title: notice.title, body: notice.body },
      // `body` (JSON) é a convenção que o expo-notifications lê para preencher content.data no app.
      data: { ...flat, body: JSON.stringify(notice.data ?? {}), title: notice.title, message: notice.body },
      android: {
        priority: "HIGH",
        ttl: "86400s",
        notification: { channel_id: "conecta-alerts", sound: "default", color: "#0B5FD8", notification_priority: "PRIORITY_MAX", default_vibrate_timings: true },
      },
    },
  };

  let refreshed = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const bearer = await accessToken(refreshed);
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) return { ok: true };
      const text = await response.text().catch(() => "");
      let status = "";
      let errorCode = "";
      try {
        const parsed = JSON.parse(text) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } };
        status = parsed.error?.status ?? "";
        errorCode = parsed.error?.details?.find((item) => item.errorCode)?.errorCode ?? "";
      } catch { /* resposta não-JSON */ }
      const code = errorCode || status || `HTTP${response.status}`;
      if (response.status === 401 && !refreshed) { refreshed = true; cachedToken = null; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt)); continue; }
      console.warn(`[fcm] envio recusado (${response.status} ${code}): ${text.slice(0, 240)}`);
      // UNREGISTERED / token malformado → o token não serve mais.
      // SENDER_ID_MISMATCH NÃO apaga o token: costuma ser chave de outro projeto Firebase no servidor (erro de configuração).
      const invalidToken = code === "UNREGISTERED" || response.status === 404 || (code === "INVALID_ARGUMENT" && /registration token|not a valid FCM/i.test(text));
      return { ok: false, code, invalidToken };
    } catch (error) {
      const name = (error as Error).message;
      if (name === "FcmAuthError") return { ok: false, code: "FcmAuthError", invalidToken: false };
      if (attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt)); continue; }
      console.warn("[fcm] falha de rede:", error);
      return { ok: false, code: "NetworkError", invalidToken: false };
    }
  }
  return { ok: false, code: "NetworkError", invalidToken: false };
}
