import { AppState, type AppStateStatus } from "react-native";
import * as Network from "expo-network";
import { getApiBaseUrl, getWsUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

export type RealtimeScope = "requests" | "announcements" | "notifications" | "suggestions" | "residents" | "dashboard" | "neighborhoods" | "social" | "me";
/** idle = sem sessão (nada a conectar); connecting = conectando/reconectando; live = ao vivo; offline = sem conseguir conectar há muito tempo. */
export type RealtimeStatus = "idle" | "offline" | "connecting" | "live";

type ScopeListener = (scopes: RealtimeScope[]) => void;

/**
 * Cliente WebSocket com reconexão automática (backoff exponencial), reconexão imediata ao trocar de
 * rede (Wi-Fi ↔ 4G/5G) e ao voltar para o app. O servidor só envia "o que mudou"; o app recarrega
 * apenas as consultas afetadas. Funciona entre aparelhos e redes diferentes porque tudo passa pelo
 * servidor público (wss://).
 */
class RealtimeClient {
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = "idle";
  private statusListeners = new Set<(s: RealtimeStatus) => void>();
  private scopeListeners = new Set<ScopeListener>();
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;
  private appStateSub: { remove: () => void } | null = null;
  private netSub: { remove: () => void } | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private lastNetworkKey = "";
  private connecting = false;
  private openTimer: ReturnType<typeof setTimeout> | null = null;

  getStatus() { return this.status; }
  onStatus(listener: (s: RealtimeStatus) => void) { this.statusListeners.add(listener); return () => { this.statusListeners.delete(listener); }; }
  onScopes(listener: ScopeListener) { this.scopeListeners.add(listener); return () => { this.scopeListeners.delete(listener); }; }

  private setStatus(next: RealtimeStatus) {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }

  start() {
    if (this.wanted) return;
    this.wanted = true;
    this.setStatus("connecting");
    this.appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      this.attempt = 0;
      // Ao voltar do segundo plano o Android/iOS pode ter matado o socket sem avisar: se estiver quieto há
      // mais de 35 s (o servidor manda batimento a cada 25 s), descarta e reconecta; senão apenas confere.
      if (this.ws && Date.now() - this.lastMessageAt > 35_000) this.dropSocket();
      void this.connect();
    });
    try {
      this.netSub = Network.addNetworkStateListener((state) => {
        const reachable = Boolean(state.isConnected) && state.isInternetReachable !== false;
        const key = `${state.type ?? "?"}:${reachable}`;
        const changed = key !== this.lastNetworkKey;
        this.lastNetworkKey = key;
        // Só reconecta quando a rede realmente mudou (Wi-Fi ↔ 4G) ou voltou; evita derrubar uma conexão saudável.
        if (reachable && (changed || this.status !== "live")) { this.attempt = 0; this.dropSocket(); void this.connect(); }
      });
    } catch { /* plataforma sem listener: o watchdog/backoff cuida da reconexão */ }
    // Watchdog: sem nenhuma mensagem (nem batimento) por 70 s = conexão morta sem "close" (comum ao trocar de rede).
    this.watchdog = setInterval(() => {
      if (!this.wanted) return;
      if (this.ws && Date.now() - this.lastMessageAt > 70_000) { this.dropSocket(); this.setStatus("connecting"); this.attempt = 0; void this.connect(); }
      else if (!this.ws && !this.retryTimer) void this.connect();
    }, 15_000);
    void this.connect();
  }

  stop() {
    this.wanted = false;
    this.appStateSub?.remove(); this.appStateSub = null;
    this.netSub?.remove(); this.netSub = null;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    this.dropSocket();
    this.clearOpenTimer();
    this.setStatus("idle");
  }

  private dropSocket() {
    const socket = this.ws;
    this.ws = null;
    if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; try { socket.close(); } catch { /* já fechado */ } }
  }

  private scheduleRetry() {
    if (!this.wanted) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.attempt, 5)) + Math.random() * 500;
    this.attempt += 1;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.connect(); }, delay);
  }

  private clearOpenTimer() { if (this.openTimer) { clearTimeout(this.openTimer); this.openTimer = null; } }
  private markFailed() { this.setStatus(this.attempt >= 6 ? "offline" : "connecting"); }
  private async wakeServer() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      await fetch(`${getApiBaseUrl()}/api/health`, { signal: controller.signal }).catch(() => undefined);
      clearTimeout(timer);
    } catch { /* ignorado: o backoff tenta de novo */ }
  }

  private async connect() {
    if (!this.wanted) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.connecting) return; // evita dois sockets quando vários eventos (rede, app, timer) disparam juntos
    this.connecting = true;
    let token: string | null = null;
    try { token = await Auth.getSessionToken(); } finally { this.connecting = false; }
    if (!this.wanted) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (!token) { this.setStatus("idle"); return; }
    this.setStatus("connecting");
    // Servidor "dormindo" (hospedagem gratuita): uma chamada HTTP o acorda antes de tentar o WebSocket.
    if (this.attempt >= 1) {
      this.connecting = true; // impede que outro evento (rede/app/timer) abra um segundo socket enquanto acorda o servidor
      try { await this.wakeServer(); } finally { this.connecting = false; }
    }
    if (!this.wanted || (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))) return;
    let socket: WebSocket;
    try { socket = new WebSocket(getWsUrl()); } catch { this.markFailed(); this.scheduleRetry(); return; }
    this.ws = socket;
    this.lastMessageAt = Date.now();
    // Se não ficar "ao vivo" em 20 s (servidor acordando / rede ruim), descarta e tenta de novo.
    this.clearOpenTimer();
    this.openTimer = setTimeout(() => { if (this.ws === socket && this.status !== "live") { this.dropSocket(); this.markFailed(); this.scheduleRetry(); } }, 20_000);
    socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      try {
        const message = JSON.parse(String(event.data)) as { type: string; scopes?: RealtimeScope[] };
        if (message.type === "ready") { this.attempt = 0; this.clearOpenTimer(); this.setStatus("live"); this.scopeListeners.forEach((l) => l(["requests", "announcements", "notifications", "suggestions", "me"])); }
        else if (message.type === "ping") { try { socket.send(JSON.stringify({ type: "ping" })); } catch { /* onclose cuida */ } }
        else if (message.type === "invalidate" && message.scopes) this.scopeListeners.forEach((l) => l(message.scopes!));
      } catch { /* mensagem inválida ignorada */ }
    };
    socket.onclose = (event) => {
      if (this.ws !== socket) return; // evento de um socket antigo já descartado
      this.ws = null;
      this.clearOpenTimer();
      const code = (event as { code?: number }).code;
      // Enquanto tenta reconectar mostra "Conectando"; só vira "Sem tempo real" após várias falhas seguidas.
      if (code === 4401) { this.attempt = Math.max(this.attempt, 4); this.setStatus("offline"); } // sessão inválida/bloqueado
      else { if (code === 1012) this.attempt = 0; /* servidor reiniciando: tenta de novo logo */ this.markFailed(); }
      this.scheduleRetry();
    };
    socket.onerror = () => { /* onclose cuida do retry */ };
  }
}

export const realtime = new RealtimeClient();
