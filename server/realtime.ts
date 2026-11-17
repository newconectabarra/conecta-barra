import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { sdk } from "./_core/sdk";
import * as db from "./db";

/** Cada escopo corresponde a um grupo de consultas do app que deve ser recarregado. */
export type RealtimeScope = "requests" | "announcements" | "notifications" | "suggestions" | "residents" | "dashboard" | "neighborhoods" | "social" | "me";

type Client = { ws: WebSocket; userId: number; role: "user" | "admin"; neighborhood: string | null; alive: boolean; limited: boolean };
const clients = new Set<Client>();

export type RealtimeTarget = {
  scopes: RealtimeScope[];
  userIds?: number[];
  /** Entrega a todos os administradores. */
  admins?: boolean;
  /** Entrega aos moradores deste bairro (e aos administradores). `null` = toda a cidade. */
  neighborhood?: string | null;
  everyone?: boolean;
};

export function emit(target: RealtimeTarget) {
  const payload = JSON.stringify({ type: "invalidate", scopes: target.scopes, at: Date.now() });
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    const match =
      target.everyone ||
      (target.userIds?.includes(client.userId) ?? false) ||
      (target.admins && client.role === "admin") ||
      (target.neighborhood !== undefined && (client.role === "admin" || target.neighborhood === null || client.neighborhood === target.neighborhood));
    if (match) { try { client.ws.send(payload); } catch { /* socket morrendo: o ping/close remove */ } }
  }
}

export function realtimeClientCount() { return clients.size; }

/** Usado no desligamento do servidor: 1012 = "service restart" → o app reconecta imediatamente. */
export function closeAllRealtime() {
  for (const client of clients) { try { client.ws.close(1012, "service restart"); } catch { /* ignorado */ } }
}

const MAX_CONNECTIONS_PER_USER = 5;

export async function refreshClientProfile(userId: number) {
  const neighborhood = await db.getUserNeighborhood(userId).catch(() => null);
  for (const client of clients) if (client.userId === userId) client.neighborhood = neighborhood;
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096, perMessageDeflate: false });
  wss.on("error", (error) => console.warn("[ws] erro no servidor:", error));

  wss.on("connection", (ws) => {
    let client: Client | null = null;
    const timeout = setTimeout(() => { if (!client) ws.close(4401, "auth timeout"); }, 10_000);

    ws.on("message", async (raw) => {
      if (client) {
        // Depois de autenticado o cliente só pode enviar "ping" (usado para detectar conexão morta).
        try { if (JSON.parse(raw.toString())?.type === "ping") { client.alive = true; ws.send(JSON.stringify({ type: "pong", at: Date.now() })); } } catch { /* ignorado */ }
        return;
      }
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; token?: string };
        if (message.type !== "auth" || !message.token) throw new Error("bad auth");
        const user = await sdk.authenticateToken(message.token);
        if (user.role === "user" && user.residentStatus === "blocked") throw new Error("not allowed");
        const neighborhood = user.role === "user" ? await db.getUserNeighborhood(user.id).catch(() => null) : null;
        client = { ws, userId: user.id, role: user.role, neighborhood, alive: true, limited: false };
        // Limita conexões por usuário (aparelho antigo "preso" não acumula): fecha as mais antigas.
        const mine = [...clients].filter((item) => item.userId === user.id);
        for (const old of mine.slice(0, Math.max(0, mine.length - (MAX_CONNECTIONS_PER_USER - 1)))) { try { old.ws.close(1000, "replaced"); } catch { /* ignorado */ } clients.delete(old); }
        clients.add(client);
        clearTimeout(timeout);
        ws.send(JSON.stringify({ type: "ready", at: Date.now() }));
      } catch {
        ws.close(4401, "unauthorized");
      }
    });
    ws.on("pong", () => { if (client) client.alive = true; });
    ws.on("close", () => { clearTimeout(timeout); if (client) clients.delete(client); });
    ws.on("error", () => { clearTimeout(timeout); if (client) clients.delete(client); });
  });

  // Detecta conexões mortas (troca de rede Wi-Fi ↔ 4G) e libera o recurso. Além do ping do protocolo
  // (que mantém o proxy aberto), envia um "ping" em JSON: o app usa essa mensagem como batimento
  // para perceber sozinho que a conexão caiu sem aviso e reconectar.
  const interval = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) { client.ws.terminate(); clients.delete(client); continue; }
      client.alive = false;
      try { client.ws.ping(); client.ws.send(JSON.stringify({ type: "ping", at: Date.now() })); } catch { /* ignorado */ }
    }
  }, 25_000);
  wss.on("close", () => clearInterval(interval));
  return wss;
}
