import { getApiBaseUrl } from "@/constants/oauth";

let lastWarmup = 0;

/**
 * O plano gratuito do Render hiberna após ~15 min sem acessos e a primeira chamada demora (30–60 s).
 * Este "toque" no /api/health acorda o servidor assim que o app abre, antes do usuário tentar entrar.
 */
export function warmUpServer(): void {
  if (Date.now() - lastWarmup < 60_000) return;
  lastWarmup = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70_000);
  fetch(`${getApiBaseUrl()}/api/health`, { signal: controller.signal, headers: { Accept: "application/json" } })
    .catch(() => undefined)
    .finally(() => clearTimeout(timer));
}
