import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { Platform } from "react-native";
import { recordNetworkError } from "@/lib/network-telemetry";

export const trpc = createTRPCReact<AppRouter>();

const QUERY_TIMEOUT_MS = 15_000;
const MUTATION_TIMEOUT_MS = 45_000;
const SESSION_READ_TIMEOUT_MS = 3_000;

async function getSessionTokenWithTimeout() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Auth.getSessionToken(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SESSION_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createTRPCClient() {
  const apiUrl = `${getApiBaseUrl().replace(/\/$/, "")}/api/trpc`;
  console.log(`[API] Using ${apiUrl} (${Platform.OS})`);

  return trpc.createClient({
    links: [
      httpLink({
        url: apiUrl,
        transformer: superjson,
        async headers() {
          const token = await getSessionTokenWithTimeout();
          return {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
        },
        async fetch(url, options) {
          const timeoutMs = options?.method?.toUpperCase() === "POST" ? MUTATION_TIMEOUT_MS : QUERY_TIMEOUT_MS;
          const controller = new AbortController();
          const originalSignal = options?.signal;
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          let timedOut = false;
          const abortFromOriginal = () => controller.abort();

          if (originalSignal?.aborted) {
            controller.abort();
          } else {
            originalSignal?.addEventListener("abort", abortFromOriginal, { once: true });
          }

          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs);

          const startedAt = Date.now();
          const requestUrl = String(url);
          const authToken = await getSessionTokenWithTimeout();
          try {
            const response = await fetch(url, {
              ...options,
              signal: controller.signal,
              credentials: Platform.OS === "web" ? "include" : "omit",
            });
            const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
            if (!contentType.includes("application/json")) {
              let preview = "";
              try { preview = (await response.clone().text()).trim().slice(0, 160); } catch { /* ignore unreadable response bodies */ }
              const isHtml = contentType.includes("text/html") || preview.startsWith("<");
              const message = isHtml
                ? "O servidor retornou uma página HTML em vez de uma resposta da API. Verifique a conexão e tente novamente."
                : `A API retornou uma resposta inválida${response.status ? ` (HTTP ${response.status})` : ""}. Tente novamente.`;
              void recordNetworkError({
                url: requestUrl,
                method: options?.method,
                status: response.status,
                error: new Error(message),
                durationMs: Date.now() - startedAt,
                authenticated: Boolean(authToken),
              });
              throw new Error(message);
            }
            return response;
          } catch (error) {
            void recordNetworkError({
              url: requestUrl,
              method: options?.method,
              error: timedOut ? new Error("NetworkTimeout") : error,
              durationMs: Date.now() - startedAt,
              authenticated: Boolean(authToken),
            });
            if (timedOut) throw new Error("A conexão demorou mais que o esperado.");
            throw error;
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
            originalSignal?.removeEventListener("abort", abortFromOriginal);
          }
        },
      }),
    ],
  });
}
