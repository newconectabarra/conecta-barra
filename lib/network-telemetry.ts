import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { safeEndpoint, safeMessage, type NetworkTelemetryEvent } from "@/lib/network-telemetry-core";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

const STORAGE_KEY = "conecta:network-telemetry:v1";
const MAX_EVENTS = 50;
const FLUSH_BATCH_SIZE = 10;
let flushInFlight: Promise<void> | null = null;

function normalizePlatform(): "android" | "ios" | "web" | "unknown" {
  if (Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "web") return Platform.OS;
  return "unknown";
}

async function readEvents() {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    const events = existing ? JSON.parse(existing) : [];
    return Array.isArray(events) ? (events as NetworkTelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

async function persistEvents(events: NetworkTelemetryEvent[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
}

/**
 * Best-effort upload. It deliberately uses fetch directly instead of the instrumented
 * tRPC client, preventing a telemetry failure from recursively generating telemetry.
 */
export async function flushNetworkTelemetry() {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    try {
      const token = await Auth.getSessionToken();
      const pending = await readEvents();
      if (!pending.length || (!token && Platform.OS !== "web")) return;

      const endpoint = `${getApiBaseUrl().replace(/\/$/, "")}/api/trpc/telemetry.record?batch=1`;
      const sentEvents: NetworkTelemetryEvent[] = [];
      for (const event of pending.slice(0, FLUSH_BATCH_SIZE)) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: Platform.OS === "web" ? "include" : "omit",
          body: JSON.stringify({ 0: { json: {
            endpoint: event.endpoint,
            method: event.method,
            status: event.status ?? null,
            errorCode: event.errorCode ?? null,
            message: event.message,
            durationMs: event.durationMs,
            platform: normalizePlatform(),
            appVersion: event.appVersion,
          } } }),
        });
        let payload: unknown = null;
        try { payload = await response.json(); } catch { /* keep the event queued */ }
        const batchError = Array.isArray(payload) && Boolean((payload[0] as { error?: unknown } | undefined)?.error);
        if (!response.ok || batchError) break;
        sentEvents.push(event);
      }

      const refreshed = await readEvents();
      const sentKeys = new Set(sentEvents.map((event) => event.timestamp));
      const stillPending = refreshed.filter((event) => !sentKeys.has(event.timestamp));
      if (stillPending.length !== refreshed.length) await persistEvents(stillPending);
    } catch {
      // Offline/auth/backend failures leave the local queue intact for a later attempt.
    } finally {
      flushInFlight = null;
    }
  })();
  return flushInFlight;
}

export async function recordNetworkError(input: {
  url: string;
  method?: string;
  status?: number;
  error?: unknown;
  durationMs: number;
  authenticated?: boolean;
}) {
  const event: NetworkTelemetryEvent = {
    timestamp: new Date().toISOString(),
    endpoint: safeEndpoint(input.url),
    method: (input.method || "GET").toUpperCase(),
    ...(typeof input.status === "number" ? { status: input.status } : {}),
    errorCode: input.error instanceof Error ? input.error.name : undefined,
    message: safeMessage(input.error),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    platform: normalizePlatform(),
    appVersion: Constants.expoConfig?.version ?? "unknown",
    authenticated: Boolean(input.authenticated),
  };

  console.warn("[NetworkTelemetry]", event);
  try {
    const events = await readEvents();
    await persistEvents([...events, event]);
    if (event.authenticated) void flushNetworkTelemetry();
  } catch {
    // Telemetry must never interrupt or delay the user flow.
  }
}

export async function getNetworkTelemetry() {
  return readEvents();
}

export async function clearNetworkTelemetry() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
