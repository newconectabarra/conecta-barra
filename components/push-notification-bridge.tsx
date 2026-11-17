import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { useAuth } from "@/hooks/use-auth";
import { subscribeAuthChange } from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";
import { setCurrentPushToken } from "@/lib/push-token";
import { ensureDeviceRegistered } from "@/lib/push-register";

/** Reenvia o token ao servidor pelo menos a cada 12 h (o servidor apaga tokens que o FCM marcou como inválidos). */
const REREGISTER_MS = 12 * 60 * 60 * 1000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type PushData = {
  screen?: string;
  announcementId?: number | string;
  requestId?: number | string;
  suggestionId?: number | string;
};

function asId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

/** Mensagens enviadas direto pelo FCM trazem o conteúdo também como JSON no campo `body`; junta tudo num só objeto. */
function normalizePushData(raw: unknown): PushData {
  if (!raw || typeof raw !== "object") return {};
  const data = { ...(raw as Record<string, unknown>) };
  if (typeof data.body === "string") {
    try { Object.assign(data, JSON.parse(data.body)); } catch { /* body não era JSON */ }
  }
  return data as PushData;
}

function openPushTarget(rawData: unknown, role?: string | null) {
  const data = normalizePushData(rawData);
  const screen = data?.screen;
  const announcementId = asId(data?.announcementId);
  const requestId = asId(data?.requestId);
  const suggestionId = asId(data?.suggestionId);

  if (screen === "announcements" && announcementId) {
    router.push({ pathname: "/announcements", params: { announcementId } });
    return;
  }
  if (screen === "requests" && requestId) {
    if (role === "admin") router.push({ pathname: "/admin/request-detail", params: { id: requestId } });
    else router.push({ pathname: "/requests", params: { requestId } });
    return;
  }
  if (screen === "suggestions" && suggestionId) {
    if (role === "admin") router.push({ pathname: "/admin/suggestions", params: { suggestionId } });
    else router.push({ pathname: "/suggestions", params: { suggestionId } });
    return;
  }
  if (screen === "profile" || screen === "account") {
    router.push("/(tabs)/profile");
    return;
  }
  if (screen === "residents" && role === "admin") {
    router.push("/admin/residents");
    return;
  }
  router.push("/notifications");
}

export function PushNotificationBridge() {
  const { user, loading, refresh } = useAuth();
  const utils = trpc.useUtils();
  const handledResponses = useRef(new Set<string>());
  const registeredKey = useRef<string | null>(null);
  const registeredAt = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  // O estado do `useAuth` desta ponte só era lido na abertura do app. Quem instalava o app,
  // entrava depois e não reiniciava ficava sem registrar o token. Agora a ponte é avisada
  // sempre que a sessão muda (login, logout, biometria).
  useEffect(() => subscribeAuthChange(() => { void refresh(); }), [refresh]);

  // Ao voltar para o app, tenta de novo se o registro anterior falhou (ex.: sem internet).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setRetryTick((value) => value + 1);
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    // Toque na notificação com o app fechado: espera a sessão carregar para escolher a tela certa
    // (administrador abre o detalhe; morador abre a lista). Antes, `role` ainda vinha vazio e todos caíam na tela errada.
    if (loading) return;
    const open = (response: Notifications.NotificationResponse) => {
      const key = response.notification.request.identifier;
      if (handledResponses.current.has(key)) return;
      handledResponses.current.add(key);
      openPushTarget(response.notification.request.content.data, user?.role);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(open);

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) open(response);
      })
      .catch(() => undefined);

    return () => responseSubscription.remove();
  }, [user?.role, loading]);

  // O FCM pode trocar o token a qualquer momento (reinstalação, limpeza de dados, rotação). Sem isso o
  // servidor continuava enviando para o token antigo e as notificações simplesmente paravam de chegar.
  useEffect(() => {
    if (Platform.OS === "web" || !user?.id) return;
    const subscription = Notifications.addPushTokenListener((next) => {
      if (!next?.data) return;
      setCurrentPushToken(next.data);
      registeredKey.current = null;
      setRetryTick((value) => value + 1);
    });
    return () => subscription.remove();
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!user?.id) {
      registeredKey.current = null;
      return;
    }
    if (!Device.isDevice) return;

    if (registeredKey.current?.startsWith(`${user.id}:`) && Date.now() - registeredAt.current < REREGISTER_MS) return;
    let cancelled = false;
    const register = async () => {
      const { token } = await ensureDeviceRegistered(utils.client);
      if (cancelled) return;
      const key = `${user.id}:${token}`;
      registeredKey.current = key;
      registeredAt.current = Date.now();
      console.log("[Push] Dispositivo registrado para notificações push.");
    };

    void register().catch((error) => {
      console.warn("[Push] Não foi possível registrar este dispositivo:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, retryTick]);

  return null;
}
