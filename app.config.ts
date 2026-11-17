// Carrega variáveis de ambiente (.env) sem sobrescrever as do sistema/EAS.
import "./scripts/load-env.js";
import { existsSync, readFileSync } from "node:fs";
import type { ExpoConfig } from "expo/config";

/**
 * VERSÃO 2.0 — NENHUMA CONTA REAL FICA GRAVADA AQUI.
 * Tudo o que identifica as SUAS contas (URL do servidor, projeto Expo, Firebase) é lido de variáveis
 * (eas.json → env, arquivo .env ou ambiente) e conferido na compilação. Se algo faltar, a compilação é
 * interrompida e a mensagem explica o que criar e onde. Passo a passo completo: GUIA-DE-IMPLANTACAO.md.
 */

const PACKAGE_ID = process.env.APP_PACKAGE_ID?.trim() || "com.conectabarra.app"; // precisa ser IGUAL ao nome do pacote cadastrado no Firebase
const isPlaceholder = (value?: string) => !value || /^(COLOQUE|SEU|SUA|TROQUE|PREENCHA|<|\.\.\.)/i.test(value.trim());
const clean = (value?: string) => (isPlaceholder(value) ? "" : value!.trim());
const easBaseEnv = (() => {
  try {
    const eas = JSON.parse(readFileSync("./eas.json", "utf8")) as { build?: { base?: { env?: Record<string, string> } } };
    return eas.build?.base?.env ?? {};
  } catch {
    return {};
  }
})();

// O EAS injeta build.env no worker remoto, mas não em todas as etapas locais de leitura do app.config.ts.
// O fallback para eas.json mantém `npm run build:apk` determinístico sem gravar segredos no código.
const apiUrl = clean(process.env.EXPO_PUBLIC_API_URL || easBaseEnv.EXPO_PUBLIC_API_URL).replace(/\/$/, "");
const projectId = clean(process.env.EXPO_PUBLIC_EAS_PROJECT_ID || easBaseEnv.EXPO_PUBLIC_EAS_PROJECT_ID);
const owner = clean(process.env.EXPO_OWNER || easBaseEnv.EXPO_OWNER);
const googleServicesFile = clean(process.env.GOOGLE_SERVICES_JSON) || (existsSync("./google-services.json") ? "./google-services.json" : "");

// Compilação "valendo" (EAS ou npm run build:*): exige tudo. `expo start` em desenvolvimento não exige.
const strict = process.env.EAS_BUILD === "true" || process.env.CONECTA_STRICT === "1";
if (strict) {
  const problems: string[] = [];
  if (!/^https:\/\/[^\s/]+/i.test(apiUrl)) problems.push("EXPO_PUBLIC_API_URL — endereço HTTPS do seu servidor (ex.: https://conecta-barra-api.onrender.com). Crie o servidor no Render (guia, passo 4) e coloque o endereço em eas.json → build → base → env.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) problems.push("EXPO_PUBLIC_EAS_PROJECT_ID — ID do projeto na SUA conta Expo. Rode `eas init` (guia, passo 9) e copie o ID para eas.json → build → base → env.");
  if (!googleServicesFile) problems.push("google-services.json — arquivo do SEU projeto Firebase (necessário para notificações push). Baixe em Firebase → Configurações do projeto → Seus apps → Android (guia, passo 7) e coloque na raiz do projeto.");
  if (problems.length) {
    throw new Error(
      "\n\n════════ COMPILAÇÃO INTERROMPIDA: falta configurar as suas contas ════════\n" +
        problems.map((item, index) => ` ${index + 1}. ${item}`).join("\n") +
        "\n\nExecute `npm run setup:check` para ver a lista completa de contas/repositórios a criar.\nGuia completo: GUIA-DE-IMPLANTACAO.md\n════════════════════════════════════════════════════════════════════\n",
    );
  }
}

const config: ExpoConfig = {
  name: "Conecta Barra",
  slug: "conecta-barra",
  ...(owner ? { owner } : {}),
  version: "2.0.0", // mantido: com runtimeVersion=appVersion, quem já tem o APK 2.0.0 recebe esta correção por `npm run update:ota` (só JS mudou)
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Esquema reservado para navegação interna e retorno do login Google (conectabarra://google-auth).
  scheme: "conectabarra",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  // Atualizações OTA (EAS Update): só ativas depois do `eas init` (projectId).
  ...(projectId ? { runtimeVersion: { policy: "appVersion" as const }, updates: { url: `https://u.expo.dev/${projectId}`, fallbackToCacheTimeout: 0, checkAutomatically: "ON_LOAD" as const } } : {}),
  ios: { supportsTablet: true, bundleIdentifier: PACKAGE_ID, infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: {
    package: PACKAGE_ID,
    versionCode: 1,
    adaptiveIcon: {
      backgroundImage: "./assets/images/android-icon-background.png",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    // Obrigatório para push (FCM): arquivo do SEU projeto Firebase.
    ...(googleServicesFile ? { googleServicesFile } : {}),
    permissions: ["POST_NOTIFICATIONS", "USE_BIOMETRIC", "USE_FINGERPRINT"],
    // O app não grava áudio nem desenha sobre outros apps; remove permissões desnecessárias herdadas de bibliotecas.
    blockedPermissions: ["android.permission.RECORD_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW"],
    // Sem "cleartext": apenas HTTPS/WSS em produção.
  },
  web: { bundler: "metro", output: "static", favicon: "./assets/images/favicon.png" },
  extra: { eas: projectId ? { projectId } : undefined, apiUrl, brandName: "Conecta Barra" },
  plugins: [
    "expo-router",
    ["expo-notifications", { icon: "./assets/images/notification-icon.png", color: "#0B5FD8", defaultChannel: "conecta-alerts" }],
    ["expo-local-authentication", { faceIDPermission: "Permitir que o Conecta Barra use o Face ID para proteger sua conta." }],
    ["expo-splash-screen", { image: "./assets/images/splash-icon.png", imageWidth: 220, resizeMode: "contain", backgroundColor: "#0B5FD8", dark: { backgroundColor: "#062B5E" } }],
    ["expo-build-properties", { android: { minSdkVersion: 24 } }],
    "expo-secure-store",
    "expo-updates",
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
