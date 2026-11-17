import Constants from "expo-constants";
import * as ReactNative from "react-native";

/**
 * URL pública do backend (HTTPS). Definida em tempo de COMPILAÇÃO (nada fica gravado no código-fonte):
 *  - EAS: eas.json → build.<perfil>.env.EXPO_PUBLIC_API_URL
 *  - local: arquivo .env (veja .env.example) antes de `expo prebuild`/`expo start`
 * A compilação é interrompida com instruções se essa URL estiver faltando (veja app.config.ts e scripts/setup-check.mjs).
 */
const configured = (process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? "").trim();

export function getApiBaseUrl(): string {
  if (configured) return configured.replace(/\/$/, "");
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  // Emulador Android acessa o PC pelo 10.0.2.2 (APENAS desenvolvimento).
  if (__DEV__) return "http://10.0.2.2:3000";
  // APK de produção sem URL: nunca deveria acontecer (a compilação é bloqueada). Evita apontar para um servidor de outra pessoa.
  console.error("[config] EXPO_PUBLIC_API_URL não foi definida na compilação. Veja GUIA-DE-IMPLANTACAO.md.");
  return "";
}

/** wss://… (ou ws://… em desenvolvimento) para o canal de tempo real. */
export function getWsUrl(): string {
  return `${getApiBaseUrl().replace(/^http/, "ws")}/ws`;
}

export const SESSION_TOKEN_KEY = "conecta_session_token";
export const USER_INFO_KEY = "conecta_user_info";
