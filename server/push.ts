import type { Request } from "../drizzle/schema";
import * as db from "./db";
import { ENV } from "./_core/env";
import { emit } from "./realtime";
import { fcmConfigured, sendFcm } from "./fcm";

type PushCategory = "announcements" | "requests" | "suggestions" | "account";

type NoticeInput = {
  type: string;
  title: string;
  body: string;
  category: PushCategory;
  data?: Record<string, unknown>;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: Record<string, unknown>;
  channelId: string;
  priority: "high";
  ttl: number;
};

type ExpoPushTicket = {
  id?: string;
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

type PushDeliveryResult = {
  targeted: number;
  accepted: number;
  delivered: number;
  invalid: number;
  receiptErrors: number;
  /** Códigos de erro devolvidos pelo Expo/FCM (ex.: InvalidCredentials, MismatchSenderId). */
  errors: string[];
  reason: "no_registered_token" | "accepted" | "rejected";
  /** Quantos foram aceitos por cada via (FCM direto x Expo). */
  viaFcm?: number;
  viaExpo?: number;
};

function summarizeExpoHttpError(status: number, body: string) {
  const compact = body.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!compact) return `ExpoHTTP${status}`;
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ code?: string; message?: string }>; error?: string; message?: string };
    const detail = parsed.errors?.map((item) => [item.code, item.message].filter(Boolean).join(": ")).filter(Boolean).join(" | ") || parsed.error || parsed.message;
    return detail ? `ExpoHTTP${status}:${detail.slice(0, 180)}` : `ExpoHTTP${status}:${compact}`;
  } catch {
    return `ExpoHTTP${status}:${compact}`;
  }
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function expoHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  // Opcional: necessário apenas se a opção "Enhanced Security for Push Notifications" estiver ativa no projeto Expo.
  const accessToken = ENV.expoAccessToken;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}
const statusLabels: Record<Request["status"], string> = {
  received: "Recebida",
  reviewing: "Em análise",
  forwarded: "Encaminhada",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

async function sendViaExpo(rows: Array<{ token: string }>, notice: NoticeInput) {
  const invalidTokens = new Set<string>();
  const errors = new Set<string>();
  let accepted = 0;

  // Tokens antigos podem ter sido emitidos por outro projeto Expo; o Expo rejeita um lote que mistura
  // projetos, então cada token é enviado separadamente.
  const sendOne = async (row: { token: string }) => {
    const messages: ExpoPushMessage[] = [{
      to: row.token,
      title: notice.title,
      body: notice.body,
      sound: "default",
      channelId: "conecta-alerts",
      priority: "high",
      ttl: 86400,
      data: notice.data ?? {},
    }];

    // Até 3 tentativas (rede instável, 429 ou 5xx do Expo) com espera crescente; timeout de 15 s por chamada.
    for (let tryIndex = 0; tryIndex < 3; tryIndex += 1) {
      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST",
          headers: expoHeaders(),
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          const responseBody = await response.text().catch(() => "");
          const errorCode = summarizeExpoHttpError(response.status, responseBody);
          console.warn(`[Push] Expo service returned ${errorCode}`);
          if ((response.status === 429 || response.status >= 500) && tryIndex < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** tryIndex)); continue; }
          errors.add(errorCode);
          return;
        }
        const payload = (await response.json()) as { data?: ExpoPushTicket[]; errors?: Array<{ code?: string; message?: string }> };
        (payload.errors ?? []).forEach((item) => {
          console.warn("[Push] Expo request error:", item.code, item.message);
          errors.add(item.code ?? "ExpoRequestError");
        });
        (payload.data ?? []).forEach((ticket) => {
          if (ticket.status === "ok") { accepted += 1; return; }
          const code = ticket.details?.error ?? "TicketError";
          errors.add(code);
          console.warn(`[Push] Ticket rejected (${code}): ${ticket.message ?? ""}`);
          if (code === "DeviceNotRegistered") invalidTokens.add(row.token);
        });
        return;
      } catch (error) {
        console.warn("[Push] Remote delivery failed:", error);
        if (tryIndex < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** tryIndex)); continue; }
        errors.add("NetworkError");
      }
    }
  };

  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(8, rows.length) }, async () => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex];
      nextIndex += 1;
      await sendOne(row);
    }
  }));
  return { accepted, invalidTokens, errors };
}

async function sendViaFcm(rows: Array<{ token: string }>, notice: NoticeInput) {
  const invalidTokens = new Set<string>();
  const errors = new Set<string>();
  let accepted = 0;
  if (!fcmConfigured()) {
    errors.add("FcmNotConfigured");
    return { accepted, invalidTokens, errors };
  }
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(10, rows.length) }, async () => {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex];
      nextIndex += 1;
      const result = await sendFcm(row.token, { title: notice.title, body: notice.body, data: notice.data });
      if (result.ok) accepted += 1;
      else {
        errors.add(result.code);
        if (result.invalidToken) invalidTokens.add(row.token);
      }
    }
  }));
  return { accepted, invalidTokens, errors };
}

async function sendRemotePush(userIds: number[], notice: NoticeInput, options?: { respectPreferences?: boolean }): Promise<PushDeliveryResult> {
  const tokenRows = await db.listPushTokensForUsers(userIds, notice.category, options?.respectPreferences ?? true);
  // Dois tipos de token convivem: "ExponentPushToken[...]" (via Expo) e token FCM nativo (envio direto, gratuito).
  const expoRows = tokenRows.filter((row) => isExpoPushToken(row.token));
  const fcmRows = tokenRows.filter((row) => !isExpoPushToken(row.token) && row.token.length >= 100);
  if (expoRows.length + fcmRows.length === 0) {
    return { targeted: 0, accepted: 0, delivered: 0, invalid: 0, receiptErrors: 0, errors: [], reason: "no_registered_token" as const };
  }

  const [viaExpo, viaFcm] = await Promise.all([
    expoRows.length ? sendViaExpo(expoRows, notice) : Promise.resolve({ accepted: 0, invalidTokens: new Set<string>(), errors: new Set<string>() }),
    fcmRows.length ? sendViaFcm(fcmRows, notice) : Promise.resolve({ accepted: 0, invalidTokens: new Set<string>(), errors: new Set<string>() }),
  ]);

  const invalidTokens = new Set([...viaExpo.invalidTokens, ...viaFcm.invalidTokens]);
  if (invalidTokens.size > 0) await db.deleteNotificationTokens([...invalidTokens]);
  const accepted = viaExpo.accepted + viaFcm.accepted;
  return {
    targeted: expoRows.length + fcmRows.length,
    accepted,
    delivered: accepted,
    invalid: invalidTokens.size,
    receiptErrors: 0,
    errors: [...new Set([...viaExpo.errors, ...viaFcm.errors])],
    reason: accepted > 0 ? ("accepted" as const) : ("rejected" as const),
    viaFcm: viaFcm.accepted,
    viaExpo: viaExpo.accepted,
  };
}

async function notifyUser(userId: number, notice: NoticeInput) {
  await db.createAppNotification({
    userId,
    type: notice.type,
    title: notice.title,
    body: notice.body,
    data: notice.data ? JSON.stringify(notice.data) : null,
  });
  emit({ scopes: ["notifications", "requests", "suggestions", "me"], userIds: [userId] });
  void sendRemotePush([userId], notice).catch((error) => console.warn("[Push] Delivery task failed:", error));
}

async function notifyRoles(roles: Array<"user" | "admin">, notice: NoticeInput, neighborhood?: string | null) {
  const recipients = await db.listNotificationRecipients(roles, neighborhood);
  const userIds = [...new Set(recipients.map((recipient) => recipient.userId))];
  await db.createAppNotifications(userIds, {
    type: notice.type,
    title: notice.title,
    body: notice.body,
    data: notice.data ? JSON.stringify(notice.data) : null,
  });
  emit({ scopes: ["notifications", "requests", "suggestions", "residents", "dashboard", "announcements"], userIds });
  void sendRemotePush(userIds, notice).catch((error) => console.warn("[Push] Delivery task failed:", error));
}

export async function notifyResidentRegistration(input: { userId: number; residentName: string }) {
  await notifyRoles(["admin"], {
    type: "resident-registration",
    category: "account",
    title: "Novo cadastro de morador",
    body: `${input.residentName} enviou um cadastro para análise.`,
    data: { userId: input.userId, screen: "residents" },
  });
}

export async function notifyResidentStatus(input: { userId: number; residentStatus: "pending" | "approved" | "blocked" }) {
  const description = input.residentStatus === "approved"
    ? "Seu cadastro foi aprovado. Você já pode acessar os serviços do Conecta Barra."
    : input.residentStatus === "blocked"
      ? "Seu cadastro foi bloqueado. Procure a gestão do Conecta Barra para orientações."
      : "Seu cadastro permanece aguardando análise.";
  await notifyUser(input.userId, {
    type: "resident-status",
    category: "account",
    title: "Atualização do cadastro",
    body: description,
    data: { residentStatus: input.residentStatus, screen: "profile" },
  });
}

export async function notifyNewRequest(input: { requestId: number; residentName?: string; category: string; neighborhood?: string | null }) {
  await notifyRoles(["admin"], {
    type: "new-request",
    category: "requests",
    title: "Nova solicitação",
    body: `${input.residentName ?? "Um morador"} enviou uma solicitação${input.neighborhood ? ` no bairro ${input.neighborhood}` : ""}.`,
    data: { requestId: input.requestId, category: input.category, screen: "requests" },
  });
}

export async function notifyRequestStatusChanged(input: { userId: number; requestId: number; status: Request["status"]; message?: string }) {
  await notifyUser(input.userId, {
    type: "request-status",
    category: "requests",
    title: "Atualização da solicitação",
    body: `Status: ${statusLabels[input.status]}${input.message ? ` — ${input.message}` : ""}`,
    data: { requestId: input.requestId, status: input.status, screen: "requests" },
  });
}

export async function notifyNewSuggestion(input: { suggestionId: number; residentName?: string; title: string }) {
  await notifyRoles(["admin"], {
    type: "new-suggestion",
    category: "suggestions",
    title: "Nova sugestão",
    body: `${input.residentName ?? "Um morador"} enviou a sugestão “${input.title}”.`,
    data: { suggestionId: input.suggestionId, screen: "suggestions" },
  });
}

export async function notifySuggestionUpdated(input: { userId: number; suggestionId: number; title: string }) {
  await notifyUser(input.userId, {
    type: "suggestion-updated",
    category: "suggestions",
    title: "Sugestão atualizada",
    body: `A gestão atualizou a sugestão “${input.title}”.`,
    data: { suggestionId: input.suggestionId, screen: "suggestions" },
  });
}

export async function notifyAnnouncement(input: { announcementId: number; title: string; category: string; neighborhood?: string | null }) {
  await notifyRoles(["user"], {
    type: "announcement",
    category: "announcements",
    title: input.category === "civil_defense" ? "Alerta da Defesa Civil" : input.neighborhood ? `Comunicado – ${input.neighborhood}` : "Novo comunicado",
    body: input.title,
    data: { announcementId: input.announcementId, category: input.category, screen: "announcements" },
  }, input.neighborhood);
}

export async function notifyTestPush(userId: number) {
  const notice = {
    type: "push-test",
    category: "account",
    title: "Push de teste Conecta Barra",
    body: "Seu aparelho está configurado para receber notificações push.",
    data: { screen: "notifications", test: true },
  } satisfies NoticeInput;
  const delivery = await sendRemotePush([userId], notice, { respectPreferences: false });
  // Só é sucesso se o recibo do Expo não apontou erro; "aceito pelo Expo" não garante a entrega ao aparelho.
  return { success: delivery.delivered > 0, delivery } as const;
}
