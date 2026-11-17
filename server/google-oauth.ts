import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import { signInWithGoogleProfile } from "./auth-helpers";

/**
 * Login Google conduzido pelo SERVIDOR (fluxo "Web application" do OAuth).
 *
 * Por que assim: o fluxo antigo, feito dentro do app com cliente "Android", dependia do SHA-1 da keystore,
 * do esquema URI personalizado habilitado no Google Cloud e de PKCE; qualquer divergência dava erro sem
 * explicação. Aqui o Google só conversa com o servidor (HTTPS) e o app recebe um tíquete de uso único.
 *
 *   app  → abre  GET /api/auth/google/start            (navegador do sistema)
 *   Google → volta GET /api/auth/google/callback?code  (servidor troca o código, valida o id_token)
 *   servidor → página que abre  conectabarra://google-auth?ticket=…
 *   app  → auth.exchangeGoogleTicket({ ticket }) → sessão
 */

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const APP_REDIRECT = "conectabarra://google-auth";
const TICKET_TTL_MS = 2 * 60_000;

type TicketPayload = { token: string; user: Awaited<ReturnType<typeof signInWithGoogleProfile>>["user"]; profileComplete: boolean; expires: number };
const tickets = new Map<string, TicketPayload>();

const ticketCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tickets) if (value.expires < now) tickets.delete(key);
}, 60_000);
(ticketCleanupTimer as unknown as NodeJS.Timeout).unref();

/** Troca o tíquete (uso único) pela sessão. */
export function consumeGoogleTicket(ticket: string) {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.expires < Date.now()) throw new TRPCError({ code: "UNAUTHORIZED", message: "O login Google expirou. Toque em “Continuar com Google” novamente." });
  return { user: entry.user, token: entry.token, profileComplete: entry.profileComplete };
}

export function googleWebFlowConfigured() {
  return Boolean(ENV.googleWebClientId && ENV.googleWebClientSecret);
}

function baseUrl(req: Request) {
  if (ENV.publicUrl) return ENV.publicUrl;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.get("host")}`;
}

export function googleRedirectUri(req: Request) {
  return ENV.googleRedirectUri || `${baseUrl(req)}/api/auth/google/callback`;
}

function secretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

/** Página simples que devolve o usuário ao app (HTTP 302 para esquema personalizado é bloqueado em alguns navegadores). */
function returnToAppPage(res: Response, query: Record<string, string>, heading: string, detail: string) {
  const target = `${APP_REDIRECT}?${new URLSearchParams(query).toString()}`;
  res.status(200).type("html").set("Cache-Control", "no-store").send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conecta Barra</title>
<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}">
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B5FD8;color:#fff;text-align:center;padding:24px}main{max-width:360px}a{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:14px;background:#fff;color:#0B5FD8;font-weight:800;text-decoration:none}p{opacity:.9;line-height:1.5}</style></head>
<body><main><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(detail)}</p><a href="${escapeHtml(target)}">Voltar ao Conecta Barra</a></main>
<script>setTimeout(function(){location.href=${JSON.stringify(target)}},150)</script></body></html>`);
}

export function registerGoogleOAuthRoutes(app: Express) {
  app.get("/api/auth/google/start", async (req, res) => {
    if (!googleWebFlowConfigured()) {
      console.warn("[google] GOOGLE_WEB_CLIENT_SECRET não configurado no servidor.");
      return returnToAppPage(res, { error: "not_configured" }, "Login Google indisponível", "O servidor ainda não foi configurado para o login Google. Use usuário e senha ou avise a gestão.");
    }
    const state = await new SignJWT({ n: randomBytes(8).toString("hex"), p: "google-login" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(secretKey());
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: ENV.googleWebClientId,
      redirect_uri: googleRedirectUri(req),
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state,
    }).toString();
    res.redirect(302, url.toString());
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const fail = (code: string, detail: string) => returnToAppPage(res, { error: code }, "Não foi possível entrar com Google", detail);
    try {
      if (typeof req.query.error === "string") return fail("cancelled", "O login com Google foi cancelado. Você pode tentar novamente.");
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code || !state) return fail("invalid_request", "Resposta inválida do Google. Tente novamente.");
      try {
        const { payload } = await jwtVerify(state, secretKey(), { algorithms: ["HS256"] });
        if (payload.p !== "google-login") throw new Error("state de outro fluxo");
      } catch {
        return fail("state", "A solicitação expirou. Volte ao app e toque em “Continuar com Google” de novo.");
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleWebClientId,
          client_secret: ENV.googleWebClientSecret,
          redirect_uri: googleRedirectUri(req),
          grant_type: "authorization_code",
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenResponse.ok) {
        const detail = await tokenResponse.text().catch(() => "");
        // Códigos típicos: redirect_uri_mismatch (URI não cadastrado), invalid_client (segredo errado), invalid_grant.
        console.warn(`[google] troca de código falhou (${tokenResponse.status}): ${detail.slice(0, 300)}`);
        const reason = /redirect_uri_mismatch/.test(detail) ? "redirect_uri_mismatch" : /invalid_client/.test(detail) ? "invalid_client" : "token_exchange";
        return fail(reason, reason === "redirect_uri_mismatch"
          ? "O endereço de retorno não está cadastrado no Google Cloud. Avise a gestão do aplicativo."
          : reason === "invalid_client"
            ? "O segredo do cliente Google configurado no servidor está incorreto. Avise a gestão do aplicativo."
            : "O Google recusou o código de acesso. Tente novamente.");
      }
      const exchanged = (await tokenResponse.json()) as { id_token?: string };
      if (!exchanged.id_token) return fail("no_id_token", "O Google não devolveu a identificação da conta.");
      const { payload } = await jwtVerify(exchanged.id_token, googleKeys, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: ENV.googleWebClientId,
      });

      const session = await signInWithGoogleProfile(payload as Record<string, unknown>, req as unknown as { headers: Record<string, string | string[] | undefined> });
      const ticket = randomBytes(32).toString("hex");
      tickets.set(ticket, { token: session.token, user: session.user, profileComplete: session.profileComplete, expires: Date.now() + TICKET_TTL_MS });
      return returnToAppPage(res, { ticket }, "Login concluído", "Abrindo o Conecta Barra…");
    } catch (error) {
      if (error instanceof TRPCError) return fail("rejected", error.message);
      console.error("[google] callback falhou:", error);
      return fail("server_error", "Erro interno ao concluir o login Google. Tente novamente em instantes.");
    }
  });
}
