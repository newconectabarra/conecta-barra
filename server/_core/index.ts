import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { attachRealtime, realtimeClientCount, closeAllRealtime } from "../realtime";
import { sql } from "drizzle-orm";
import { storageGet } from "../storage";
import * as db from "../db";
import { registerGoogleOAuthRoutes, googleWebFlowConfigured, googleRedirectUri } from "../google-oauth";
import { fcmConfigured, fcmProjectId } from "../fcm";
import { emailProvider, emailSender, adminNotificationEmail } from "../email";
import { configItems, printConfigReport } from "./config-report";

const APP_VERSION = "2.0.1";

/** Limitador simples em memória (por IP) para rotas sensíveis. Para vários servidores, use Redis. */
function rateLimit(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  const cleanupTimer = setInterval(() => { const now = Date.now(); for (const [key, value] of hits) if (value.reset < now) hits.delete(key); }, windowMs);
  (cleanupTimer as unknown as NodeJS.Timeout).unref();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); return next(); }
    entry.count += 1;
    if (entry.count > max) { res.status(429).json({ error: "Muitas tentativas. Aguarde um instante." }); return; }
    next();
  };
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);

  // CORS: o app nativo não envia "Origin" (sempre liberado). Navegadores só são aceitos se a origem
  // estiver em ALLOWED_ORIGINS (ou em desenvolvimento). Antes, qualquer site podia chamar a API com cookies.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (!ENV.isProduction || ENV.allowedOrigins.includes(origin) || origin === ENV.publicUrl)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-platform, x-device-name");
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json({ limit: "20mb" }));
  app.get(/^\/media\/(.+)$/, async (req, res) => {
    try {
      const asset = await storageGet(String(req.params[0] ?? ""));
      if (!asset) { res.sendStatus(404); return; }
      res.setHeader("Content-Type", asset.contentType);
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(asset.data);
    } catch (error) {
      console.error("[Media] Falha ao carregar imagem:", error);
      res.sendStatus(503);
    }
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, timestamp: Date.now(), uptime: Math.round(process.uptime()), realtimeClients: realtimeClientCount() }));
  // Verifica também o banco de dados (use no monitor externo, ex.: UptimeRobot).
  app.get("/api/health/db", async (_req, res) => {
    try {
      const database = await db.getDb();
      if (!database) throw new Error("sem banco");
      await Promise.race([database.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))]);
      res.json({ ok: true, db: true, timestamp: Date.now() });
    } catch (error) {
      console.warn("[health] banco indisponível:", error);
      res.status(503).json({ ok: false, db: false });
    }
  });
  // Diagnóstico SEM segredos: só mostra se cada configuração obrigatória está presente (abra no navegador).
  app.get("/api/health/config", async (req, res) => {
    let database = false;
    try { const conn = await db.getDb(); if (conn) { await Promise.race([conn.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))]); database = true; } } catch { database = false; }
    const items = configItems(database);
    res.json({
      ok: items.filter((item) => item.level === "required").every((item) => item.ok),
      database,
      adminLoginConfigured: Boolean(ENV.adminUsername && ENV.adminPassword),
      dataEncryptionKeyConfigured: Boolean(ENV.dataEncryptionKey),
      publicUrl: ENV.publicUrl || null,
      emailProvider: emailProvider(),
      emailSender: emailSender() ? emailSender().replace(/^(.).*(@.*)$/, "$1***$2") : null,
      adminNotificationEmailConfigured: Boolean(adminNotificationEmail()),
      emailVerificationRequired: ENV.requireEmailVerification && emailProvider() !== "none",
      residentApprovalRequired: ENV.requireResidentApproval,
      googleLoginConfigured: googleWebFlowConfigured(),
      googleRedirectUriToRegister: googleRedirectUri(req),
      pushFcmConfigured: fcmConfigured(),
      pushFcmProject: fcmProjectId(),
      // Lista do que ainda falta (texto de ajuda para quem está configurando).
      pending: items.filter((item) => !item.ok).map((item) => ({ item: item.label, level: item.level, how: item.how })),
      version: APP_VERSION,
    });
  });
  app.use("/api/auth/google/start", rateLimit(60_000, 20));
  registerGoogleOAuthRoutes(app);
  app.get("/api/auth/me", async (req, res) => {
    try { const user = await sdk.authenticateRequest(req); res.json({ user }); } catch { res.status(401).json({ user: null }); }
  });

  // Proteção contra tentativa de adivinhar senha e abuso da busca de CEP.
  app.use("/api/trpc/auth.login", rateLimit(60_000, 12));
  app.use("/api/trpc/auth.register", rateLimit(60_000, 8));
  app.use("/api/trpc/auth.exchangeGoogleTicket", rateLimit(60_000, 20));
  app.use("/api/trpc/auth.requestPasswordReset", rateLimit(60_000, 5));
  app.use("/api/trpc/auth.verifyEmail", rateLimit(60_000, 20));
  app.use("/api/trpc/auth.resendVerification", rateLimit(60_000, 5));
  app.use("/api/trpc/auth.resetPassword", rateLimit(60_000, 10));
  app.use("/api/trpc/address.lookupCep", rateLimit(60_000, 40));

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  // Proxies (Render, Caddy, Cloudflare) mantêm conexões ociosas por ~60 s. O padrão do Node (5 s) fechava
  // a conexão "por baixo" do proxy e gerava erros 502 intermitentes. O keep-alive precisa ser MAIOR que o do proxy.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;

  attachRealtime(server);
  await db.seedNeighborhoods().catch((error) => console.warn("[Seed] Bairros não semeados (tabelas ainda não criadas? rode `npm run db:push`):", error instanceof Error ? error.message : error));
  void db.getDb().then((conn) => conn ? Promise.race([conn.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))]).then(() => true, () => false) : false).then((ok) => printConfigReport(Boolean(ok)));

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] Conecta Barra ouvindo na porta ${port} (${ENV.isProduction ? "produção" : "desenvolvimento"})`);
  });

  // Encerramento limpo (deploy/reinício): avisa os aparelhos para reconectarem na hora, sem esperar o timeout.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] ${signal} recebido; encerrando.`);
    closeAllRealtime();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8_000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Uma promessa rejeitada ou exceção solta não pode derrubar o servidor (e com ele todos os WebSockets).
process.on("unhandledRejection", (reason) => console.error("[api] unhandledRejection:", reason));
process.on("uncaughtException", (error) => console.error("[api] uncaughtException:", error));

startServer().catch((error) => { console.error(error); process.exit(1); });
