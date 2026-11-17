import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { trpc } from "@/lib/trpc";
import { setCurrentPushToken } from "@/lib/push-token";

type TrpcClient = ReturnType<typeof trpc.useUtils>["client"];

const INSTALL_KEY = "conecta_install_id";

/** Identificador aleatório desta instalação (não é dado pessoal); permite ao servidor trocar o token antigo pelo novo. */
async function getInstallId(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(INSTALL_KEY);
    if (saved && /^[a-z0-9]{8,20}$/.test(saved)) return saved;
  } catch { /* usa um novo */ }
  const created = Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
  try { await AsyncStorage.setItem(INSTALL_KEY, created); } catch { /* sem persistência: segue assim mesmo */ }
  return created;
}

export type PushRegistration = { token: string; kind: "fcm" | "expo" };

/**
 * Pede permissão, cria o canal, obtém o token e o registra no servidor.
 *  - Se o servidor tem FCM configurado (gratuito): usa o token NATIVO do Firebase (envio direto, sem Expo).
 *  - Senão: usa o token do Expo (comportamento anterior).
 */
export async function ensureDeviceRegistered(client: TrpcClient): Promise<PushRegistration> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("conecta-alerts", {
      description: "Avisos locais, comunicados do seu bairro e andamento das suas solicitações",
      name: "Avisos do Conecta Barra",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      sound: "default",
      lightColor: "#0B5FD8",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") throw new Error("Permissão de notificações não concedida neste aparelho. Ative em Configurações do Android → Apps → Conecta Barra → Notificações.");

  let useFcm = false;
  try { useFcm = Platform.OS === "android" && (await client.notifications.pushConfig.query()).fcm; } catch { useFcm = false; }

  let token = "";
  let kind: "fcm" | "expo" = "expo";
  if (useFcm) {
    try {
      token = String((await Notifications.getDevicePushTokenAsync()).data ?? "");
      if (token) kind = "fcm";
    } catch (error) {
      console.warn("[Push] Token FCM indisponível, usando Expo:", error);
    }
  }
  if (!token) {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error("O projeto EAS do aplicativo não foi identificado. Instale o APK oficial mais recente.");
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    kind = "expo";
  }
  if (!token) throw new Error("Não foi possível obter o token de notificações deste aparelho.");

  const installId = await getInstallId();
  setCurrentPushToken(token);
  await client.notifications.registerDevice.mutate({ token, platform: `${kind}:${installId}` });
  return { token, kind };
}
