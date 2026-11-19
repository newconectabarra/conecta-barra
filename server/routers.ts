import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";
import { notifyAnnouncement, notifyNewRequest, notifyNewSuggestion, notifyResidentRegistration, notifyResidentStatus, notifyRequestStatusChanged, notifySuggestionUpdated, notifyTestPush } from "./push";
import { COOKIE_NAME } from "../shared/const";
import { emit, refreshClientProfile } from "./realtime";
import { lookupCep } from "./cep";
import { fetchPortalNews } from "./portal";
import { ENV } from "./_core/env";
import { CATEGORY_VALUES } from "../shared/categories";
import { composeAddress, matchNeighborhood, normalizeName } from "../shared/neighborhoods";
import { OFFICIAL_CHANNELS } from "../shared/official";
import { adminNotificationEmail, emailConfigured, emailProvider, emailSender, sendNewRegistrationAdminEmail, sendPasswordResetEmail, sendTestEmail, sendVerificationEmail } from "./email";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { hashPassword, isProfileComplete, persistSession, publicUser, safeEqual, signInWithGoogleProfile, verifyPassword } from "./auth-helpers";
import { consumeGoogleTicket, googleWebFlowConfigured } from "./google-oauth";
import { fcmConfigured } from "./fcm";

const categorySchema = z.enum(CATEGORY_VALUES);
const addressSchema = {
  cep: z.string().regex(/^\d{5}-?\d{3}$/, "Informe um CEP válido."),
  street: z.string().min(2).max(255),
  number: z.string().min(1).max(20),
  neighborhood: z.string().min(2).max(120),
  complement: z.string().max(255).optional(),
};

/** Garante que o bairro informado existe na lista da cidade (ou o cadastra quando veio de CEP válido). */
async function canonicalNeighborhood(name: string) {
  const known = (await db.listNeighborhoods(false)).map((item) => item.name);
  return matchNeighborhood(name, known) ?? name.trim();
}
const statusSchema = z.enum(["received", "reviewing", "forwarded", "in_progress", "completed", "cancelled"]);
const residentStatusSchema = z.enum(["pending", "approved", "blocked"]);

function ensureApprovedResident(user: { role: "user" | "admin"; residentStatus: "pending" | "approved" | "blocked" }) {
  if (user.role === "user" && user.residentStatus === "blocked") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu cadastro está bloqueado. Procure a gestão do Conecta Barra." });
  }
  // Só vale quando a gestão ativou REQUIRE_RESIDENT_APPROVAL=true no servidor.
  if (user.role === "user" && user.residentStatus === "pending" && ENV.requireResidentApproval) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu cadastro está aguardando a aprovação da gestão do Conecta Barra." });
  }
}

const stripAt = (value: string) => value.trim().replace(/^@+/, "").toLocaleLowerCase("pt-BR");
const adminLoginConfigured = () => Boolean(ENV.adminUsername && ENV.adminPassword);
const newCode = () => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
const CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Cadastros que pediram confirmação de e-mail e nunca a concluíram (código expirado) ficavam presos para sempre:
 * o usuário/e-mail não podia ser usado de novo. Aqui eles são liberados depois que o código vence.
 * Retorna uma mensagem se o cadastro ainda estiver dentro do prazo de confirmação.
 */
async function releaseAbandonedRegistration(credential: Awaited<ReturnType<typeof db.getResidentCredentialByUsername>>) {
  if (!credential?.userId || !credential.email || credential.emailVerifiedAt) return null;
  const pendingCode = await db.getLatestEmailVerificationCode(credential.userId);
  if (!pendingCode) return null; // conta já ativa (sem confirmação pendente)
  if (pendingCode.expiresAt.getTime() > Date.now()) return "Este cadastro já foi iniciado e aguarda o código enviado por e-mail. Digite o código ou aguarde 10 minutos para tentar de novo.";
  const owner = await db.getUserById(credential.userId);
  if (owner && owner.role === "user" && owner.loginMethod === "local") await db.deleteResident(credential.userId);
  return null;
}

async function ensureResidentProfileComplete(user: { id: number; role: "user" | "admin"; residentStatus: "pending" | "approved" | "blocked" }) {
  ensureApprovedResident(user);
  if (user.role !== "user") return;
  const credential = await db.getResidentCredentialByUserId(user.id);
  if (!isProfileComplete(credential)) throw new TRPCError({ code: "FORBIDDEN", message: "Complete seus dados cadastrais no perfil antes de usar os serviços." });
}

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

type AdminAuditInput = {
  action: string;
  targetType: string;
  targetId?: number;
  targetUserId?: number;
  summary: string;
  metadata?: Record<string, unknown>;
};

async function recordAdminAction(adminId: number, input: AdminAuditInput) {
  await db.createAdminAuditLog({
    adminId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetUserId: input.targetUserId ?? null,
    summary: input.summary.slice(0, 500),
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

/** Conta oficial vê toda a cidade; contas admin_bairro_* só podem operar o bairro gravado na ficha. */
async function getAdminNeighborhoodScope(user: { id: number; openId: string }) {
  if (user.openId === db.ADMIN_OPEN_ID) return null;
  const neighborhood = await db.getUserNeighborhood(user.id);
  if (!neighborhood) throw new TRPCError({ code: "FORBIDDEN", message: "Esta conta administrativa ainda não está vinculada a um bairro." });
  return neighborhood;
}

export const appRouter = router({
  system: systemRouter,
  admin: router({
    dashboard: adminProcedure.input(z.object({ neighborhood: z.string().max(120).optional() }).optional()).query(async ({ ctx, input }) => db.getAdminDashboardSummary(ctx.user.id, (await getAdminNeighborhoodScope(ctx.user)) ?? input?.neighborhood)),
    /** Lista contas com papel de administrador (deve haver só uma). */
    adminAccounts: adminProcedure.query(async ({ ctx }) => ({ currentUserId: ctx.user.id, currentIsOfficial: ctx.user.openId === db.ADMIN_OPEN_ID, accounts: await db.listAdminAccounts() })),
    /** Remove todas as contas administrativas extras, mantendo a que está logada (que precisa ser a oficial). */
    cleanupAdmins: adminProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.openId !== db.ADMIN_OPEN_ID) throw new TRPCError({ code: "FORBIDDEN", message: "Entre com o usuário oficial da gestão (ADMIN_USERNAME) para executar a limpeza." });
      const removed = await db.deleteAdminAccountsExcept(ctx.user.id);
      emit({ scopes: ["residents", "dashboard"], admins: true });
      void recordAdminAction(ctx.user.id, { action: "admin_cleanup", targetType: "user", targetId: ctx.user.id, targetUserId: ctx.user.id, summary: `${removed} conta(s) administrativa(s) duplicada(s) removida(s).`, metadata: { removed } });
      return { removed };
    }),
    emailStatus: adminProcedure.query(() => ({ provider: emailProvider(), sender: emailSender() || null, adminNotificationEmail: adminNotificationEmail() || null, verificationRequired: ENV.requireEmailVerification && emailConfigured() })),
    testEmail: adminProcedure.input(z.object({ to: z.string().email().max(320) })).mutation(async ({ input }) => {
      try { const result = await sendTestEmail(input.to); return { success: true, provider: emailProvider(), sender: result.sender } as const; }
      catch (error) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Falha ao enviar o e-mail de teste." }); }
    }),
    emailDelivery: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(250).optional() }).optional()).query(({ input }) => db.listEmailDeliveryLogs(input?.limit ?? 100)),
  }),
  auth: router({
    register: publicProcedure.input(z.object({ username: z.string().min(4).max(50).regex(/^[a-zA-Z0-9_.-]+$/, "Use apenas letras, números, ponto, hífen e sublinhado no usuário."), password: z.string().min(8).max(128), name: z.string().min(3).max(120), email: z.string().email().optional(), ...addressSchema, phone: z.string().min(8).max(32), sex: z.enum(["female", "male", "non_binary", "prefer_not_to_say"]) })).mutation(async ({ ctx, input }) => {
      const username = input.username.trim().toLowerCase();
      const email = input.email?.trim().toLowerCase() ?? "";
      if (ENV.adminUsername && stripAt(ENV.adminUsername) === username) throw new TRPCError({ code: "CONFLICT", message: "Este nome de usuário já está em uso." });

      // Libera cadastros antigos que nunca confirmaram o e-mail (código vencido) e recusa os ainda em andamento.
      const existingByUsername = await db.getResidentCredentialByUsername(username);
      const stalledUsername = await releaseAbandonedRegistration(existingByUsername);
      if (stalledUsername) throw new TRPCError({ code: "CONFLICT", message: stalledUsername });
      const existingByEmail = email ? await db.getResidentCredentialByEmail(email) : undefined;
      const stalledEmail = await releaseAbandonedRegistration(existingByEmail);
      if (stalledEmail) throw new TRPCError({ code: "CONFLICT", message: stalledEmail });
      if (await db.getResidentCredentialByUsername(username)) throw new TRPCError({ code: "CONFLICT", message: "Este nome de usuário já está em uso." });
      if (email && await db.getResidentCredentialByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já está cadastrado." });

      // Confirmação por e-mail só é exigida quando existe provedor de e-mail configurado no servidor.
      const verificationRequired = Boolean(email) && ENV.requireEmailVerification && emailConfigured();
      const neighborhood = await canonicalNeighborhood(input.neighborhood);
      const address = composeAddress({ street: input.street, number: input.number, complement: input.complement, neighborhood, cep: input.cep });
      const openId = `local_${username}`;
      const residentStatus = ENV.requireResidentApproval ? "pending" : "approved";

      // 1) Grava usuário + ficha. Qualquer erro aqui é de BANCO (não de e-mail) e é registrado com o motivo real.
      let user: Awaited<ReturnType<typeof db.getUserByOpenId>>;
      try {
        await db.upsertUser({ openId, name: input.name, email: email || null, loginMethod: "local", role: "user", residentStatus, lastSignedIn: new Date() });
        user = await db.getUserByOpenId(openId);
        if (!user) throw new Error("O usuário não foi encontrado depois de gravado (banco indisponível ou tabelas ausentes — rode `npm run db:push`).");
        await db.createResidentCredential({ userId: user.id, username, passwordHash: await hashPassword(input.password), address, cep: input.cep, street: input.street, number: input.number, neighborhood, complement: input.complement ?? null, phone: input.phone, sex: input.sex, email: email || null });
      } catch (error) {
        console.error("[register] falha ao gravar o cadastro no banco:", error);
        const created = await db.getUserByOpenId(openId).catch(() => undefined);
        if (created) await db.deleteResident(created.id).catch(() => undefined);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível gravar o cadastro agora. Aguarde alguns segundos (o servidor gratuito pode estar acordando) e tente de novo. Se continuar, avise a gestão.", cause: error });
      }

      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o usuário." });

      // 2) Sem confirmação de e-mail: entra direto.
      if (!verificationRequired) {
        const token = await sdk.signSession({ openId, appId: "conecta-barra", name: input.name });
        await persistSession(user.id, token, ctx.req);
        ctx.res.cookie("app_session_id", token, getSessionCookieOptions(ctx.req));
        void notifyResidentRegistration({ userId: user.id, residentName: user.name ?? username });
        return { user: publicUser(user), token, username, email, verificationRequired: false } as const;
      }

      // 3) Com confirmação: gera o código e envia. Se o ENVIO falhar, desfaz o cadastro e mostra o motivo provável.
      try {
        const code = newCode();
        await db.createEmailVerificationCode({ userId: user.id, email, codeHash: await hashPassword(code), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0 });
        await sendVerificationEmail({ name: input.name, email, code, userId: user.id });
      } catch (error) {
        console.error("[register] falha ao enviar o e-mail de confirmação:", error);
        await db.deleteResident(user.id).catch(() => undefined);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível enviar o código de confirmação para este e-mail. Confira se o endereço está correto e tente de novo em instantes. Se o problema continuar, avise a gestão (o motivo fica em Painel → Indicadores → E-mails).", cause: error });
      }
      return { success: true, username, email, verificationRequired: true } as const;
    }),
    /** Informa ao app o que o servidor oferece (sem segredos): botão do Google, confirmação por e-mail, aprovação. */
    publicConfig: publicProcedure.query(() => ({ google: googleWebFlowConfigured(), emailVerification: ENV.requireEmailVerification && emailConfigured(), passwordResetByEmail: emailConfigured(), residentApproval: ENV.requireResidentApproval })),
    verifyEmail: publicProcedure.input(z.object({ username: z.string().min(4).max(64), code: z.string().regex(/^\d{6}$/) })).mutation(async ({ input }) => {
      const username = input.username.trim().toLowerCase();
      const credential = await db.getResidentCredentialByUsername(username);
      if (!credential?.email || !credential.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro pendente não encontrado." });
      if (credential.emailVerifiedAt) return { success: true, alreadyVerified: true } as const;
      const challenge = await db.getLatestEmailVerificationCode(credential.userId);
      if (!challenge || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5) throw new TRPCError({ code: "BAD_REQUEST", message: "O código expirou ou excedeu o limite de tentativas. Solicite um novo código." });
      if (!(await verifyPassword(input.code, challenge.codeHash))) { await db.incrementEmailVerificationAttempts(challenge.id); throw new TRPCError({ code: "UNAUTHORIZED", message: "Código de confirmação incorreto." }); }
      await db.consumeEmailVerificationCode(challenge.id);
      await db.markResidentEmailVerified(credential.userId);
      const user = await db.getUserByOpenId(`local_${username}`);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      void notifyResidentRegistration({ userId: user.id, residentName: user.name ?? username });
      let adminEmailSent = false;
      if (adminNotificationEmail()) try {
        await sendNewRegistrationAdminEmail({ userId: user.id, name: user.name ?? username, username, email: credential.email, address: credential.address ?? "Não informado", phone: credential.phone ?? "Não informado", sex: credential.sex });
        adminEmailSent = true;
      } catch (error) {
        console.warn("[Registration] Could not notify administrator by email:", error);
      }
      return { success: true, alreadyVerified: false, adminEmailSent } as const;
    }),
    resendVerification: publicProcedure.input(z.object({ username: z.string().min(4).max(64) })).mutation(async ({ input }) => {
      const username = input.username.trim().toLowerCase();
      const credential = await db.getResidentCredentialByUsername(username);
      if (!credential?.email || credential.emailVerifiedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Não há confirmação pendente para este usuário." });
      const previous = await db.getLatestEmailVerificationCode(credential.userId);
      if (previous && Date.now() - previous.createdAt.getTime() < 60_000) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Aguarde um minuto antes de solicitar outro código." });
      const user = await db.getUserByOpenId(`local_${username}`);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      const code = newCode();
      await db.createEmailVerificationCode({ userId: credential.userId, email: credential.email, codeHash: await hashPassword(code), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0 });
      try {
        await sendVerificationEmail({ name: user.name ?? username, email: credential.email, code, userId: credential.userId });
      } catch (error) {
        console.error("[resendVerification] falha ao enviar e-mail:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível reenviar o código agora. Tente de novo em instantes.", cause: error });
      }
      return { success: true } as const;
    }),
    requestPasswordReset: publicProcedure.input(z.object({ username: z.string().min(4).max(64) })).mutation(async ({ input }) => {
      if (!emailConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A recuperação de senha por e-mail não está disponível neste servidor. Peça à gestão do Conecta Barra para gerar uma senha temporária." });
      const username = input.username.trim().toLowerCase();
      const credential = await db.getResidentCredentialByUsername(username);
      if (credential?.email && credential.emailVerifiedAt) {
        const previous = await db.getLatestPasswordResetCode(credential.userId);
        if (previous && Date.now() - previous.createdAt.getTime() < 60_000) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Aguarde um minuto antes de solicitar outro código." });
        const user = await db.getUserByOpenId(`local_${username}`);
        if (user) {
          const code = newCode();
          await db.createPasswordResetCode({ userId: credential.userId, codeHash: await hashPassword(code), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0 });
          // Falha de envio não é revelada ao usuário (evita descobrir quem tem cadastro), mas fica no log e no painel.
          await sendPasswordResetEmail({ name: user.name ?? username, email: credential.email, code, userId: user.id }).catch((error) => console.error("[requestPasswordReset] falha ao enviar e-mail:", error));
        }
      }
      return { success: true } as const;
    }),
    resetPassword: publicProcedure.input(z.object({ username: z.string().min(4).max(64), code: z.string().regex(/^\d{6}$/), newPassword: z.string().min(8).max(128) })).mutation(async ({ input }) => {
      const username = input.username.trim().toLowerCase();
      const credential = await db.getResidentCredentialByUsername(username);
      const challenge = credential ? await db.getLatestPasswordResetCode(credential.userId) : undefined;
      if (!credential || !challenge || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5 || !(await verifyPassword(input.code, challenge.codeHash))) {
        if (challenge && challenge.attempts < 5) await db.incrementPasswordResetAttempts(challenge.id);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Código inválido ou expirado. Solicite um novo código." });
      }
      await db.updateResidentPassword(credential.userId, await hashPassword(input.newPassword));
      await db.consumePasswordResetCode(challenge.id);
      await db.revokeAllAuthSessions(credential.userId);
      return { success: true } as const;
    }),
    login: publicProcedure.input(z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const username = input.username.trim();
      // O usuário da gestão vem de ADMIN_USERNAME (com ou sem "@", maiúsculas/minúsculas e espaços não importam).
      // Nada é gravado no código: sem ADMIN_USERNAME + ADMIN_PASSWORD no servidor, o acesso administrativo fica desativado.
      if (adminLoginConfigured() && stripAt(username) === stripAt(ENV.adminUsername)) {
        const openId = db.ADMIN_OPEN_ID;
        const existingAdmin = await db.getUserByOpenId(openId);
        // Senha trocada dentro do app (hash no banco) tem prioridade; ADMIN_FORCE_ENV_PASSWORD=true volta a valer a do servidor.
        let overrideHash = existingAdmin && !ENV.adminForceEnvPassword ? await db.getResidentPasswordHash(existingAdmin.id) : undefined;
        if (existingAdmin && ENV.adminForceEnvPassword) await db.clearAdminPasswordOverride(existingAdmin.id);
        const passwordOk = overrideHash ? await verifyPassword(input.password.trim(), overrideHash) : safeEqual(input.password.trim(), ENV.adminPassword);
        if (!passwordOk) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos." });
        await db.upsertUser({ openId, name: "Gestão Conecta Barra", loginMethod: "local-admin", role: "admin", residentStatus: "approved", lastSignedIn: new Date() });
        const user = await db.getUserByOpenId(openId);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o acesso administrativo." });
        const token = await sdk.signSession({ openId, appId: "conecta-barra", name: user.name ?? "Gestão" });
        await persistSession(user.id, token, ctx.req);
        ctx.res.cookie("app_session_id", token, getSessionCookieOptions(ctx.req));
        return { user: publicUser(user), token };
      }
      const normalizedUsername = username.toLowerCase();
      const credential = await db.getResidentCredentialByUsername(normalizedUsername);
      if (!credential || !(await verifyPassword(input.password, credential.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos." });
      const user = await db.getUserByOpenId(`local_${normalizedUsername}`);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não encontrado." });
      const pendingEmailVerification = credential.email ? await db.getLatestEmailVerificationCode(user.id) : undefined;
      if (pendingEmailVerification && !credential.emailVerifiedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Confirme seu e-mail pelo código recebido antes de entrar." });
      ensureApprovedResident(user);
      const token = await sdk.signSession({ openId: user.openId, appId: "conecta-barra", name: user.name ?? input.username });
      await persistSession(user.id, token, ctx.req);
      ctx.res.cookie("app_session_id", token, getSessionCookieOptions(ctx.req));
      return { user: publicUser(user), token };
    }),
    /** Login Google com id_token obtido no aparelho (mantido por compatibilidade). O fluxo principal é o do servidor. */
    loginGoogle: publicProcedure.input(z.object({ idToken: z.string().min(100).max(8192) })).mutation(async ({ ctx, input }) => {
      const audience = [ENV.googleWebClientId, ENV.googleAndroidClientId].filter(Boolean);
      if (audience.length === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Login Google ainda não está configurado no servidor." });
      let payload: Record<string, unknown>;
      try {
        const verified = await jwtVerify(input.idToken, googleKeys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience });
        payload = verified.payload as Record<string, unknown>;
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Token Google inválido ou expirado." });
      }
      const session = await signInWithGoogleProfile(payload, ctx.req);
      ctx.res.cookie("app_session_id", session.token, getSessionCookieOptions(ctx.req));
      return session;
    }),
    /** Troca o tíquete de uso único gerado pelo servidor (após o login no Google) pela sessão do app. */
    exchangeGoogleTicket: publicProcedure.input(z.object({ ticket: z.string().min(32).max(128).regex(/^[a-f0-9]+$/) })).mutation(({ input }) => consumeGoogleTicket(input.ticket)),
    me: publicProcedure.query(async (opts) => {
      const user = opts.ctx.user;
      if (!user) return null;
      const credentials = user.role === "user" || user.role === "admin" ? await db.getResidentCredentialByUserId(user.id) : undefined;
      // Antes, `{ ...user, ...credentials }` deixava o `id` da ficha sobrescrever o id do usuário e ainda devolvia o hash da senha ao app.
      return {
        ...publicUser(user),
        username: credentials?.username ?? null,
        address: credentials?.address ?? null,
        cep: credentials?.cep ?? null,
        street: credentials?.street ?? null,
        number: credentials?.number ?? null,
        neighborhood: credentials?.neighborhood ?? null,
        complement: credentials?.complement ?? null,
        phone: credentials?.phone ?? null,
        sex: credentials?.sex ?? null,
        householdSize: credentials?.householdSize ?? null,
        emergencyContact: credentials?.emergencyContact ?? null,
        email: user.email ?? credentials?.email ?? null,
        profileComplete: user.role === "admin" ? true : isProfileComplete(credentials),
      };
    }),
    updateAvatar: protectedProcedure.input(z.object({ photoDataBase64: z.string().min(100).max(4_194_304), photoContentType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg") })).mutation(async ({ ctx, input }) => {
      ensureApprovedResident(ctx.user);
      const stored = await storagePut(`avatars/${ctx.user.id}/${Date.now()}`, Buffer.from(input.photoDataBase64, "base64"), input.photoContentType);
      const user = await db.updateUserAvatar(ctx.user.id, stored.url);
      return { user, avatarUrl: stored.url };
    }),
    removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
      ensureApprovedResident(ctx.user);
      const user = await db.updateUserAvatar(ctx.user.id, null);
      return { user, avatarUrl: null };
    }),
    updateProfile: protectedProcedure.input(z.object({ name: z.string().min(3).max(120), ...addressSchema, phone: z.string().min(8).max(32), sex: z.enum(["female", "male", "non_binary", "prefer_not_to_say"]), email: z.string().email().optional().or(z.literal("")), householdSize: z.number().int().min(1).max(30).nullable().optional(), emergencyContact: z.string().max(255).optional() })).mutation(async ({ ctx, input }) => { ensureApprovedResident(ctx.user); const neighborhood = await canonicalNeighborhood(input.neighborhood); const address = composeAddress({ street: input.street, number: input.number, complement: input.complement, neighborhood, cep: input.cep }); const current = await db.getResidentCredentialByUserId(ctx.user.id); const result = await db.updateResidentProfile(ctx.user.id, { ...input, neighborhood, address, email: input.email || current?.email || ctx.user.email || null }); await refreshClientProfile(ctx.user.id); emit({ scopes: ["me", "announcements"], userIds: [ctx.user.id] }); return result; }),
    requestPasswordChangeConfirmation: protectedProcedure.input(z.object({ method: z.enum(["biometric", "code"]) })).mutation(async ({ ctx, input }) => {
      ensureApprovedResident(ctx.user);
      const code = input.method === "code" ? String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0") : randomBytes(32).toString("hex");
      const challengeId = await db.createPasswordChangeChallenge({ userId: ctx.user.id, codeHash: await hashPassword(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 });
      return { challengeId, method: input.method, code: input.method === "code" ? code : undefined, proof: input.method === "biometric" ? code : undefined, expiresInSeconds: 600 } as const;
    }),
    confirmPasswordChange: protectedProcedure.input(z.object({ challengeId: z.number().int().positive(), proof: z.string().min(6).max(128) })).mutation(async ({ ctx, input }) => {
      ensureApprovedResident(ctx.user);
      const challenge = await db.getPasswordChangeChallenge(ctx.user.id, input.challengeId);
      if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5) throw new TRPCError({ code: "BAD_REQUEST", message: "A confirmação expirou ou não está disponível. Solicite um novo código." });
      if (!(await verifyPassword(input.proof, challenge.codeHash))) { await db.incrementPasswordChangeChallengeAttempts(challenge.id); throw new TRPCError({ code: "UNAUTHORIZED", message: "A confirmação adicional está incorreta." }); }
      await db.confirmPasswordChangeChallenge(challenge.id);
      return { success: true } as const;
    }),
    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128), confirmationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { ensureApprovedResident(ctx.user); if (input.currentPassword === input.newPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "A nova senha precisa ser diferente da atual." }); const isAdminUser = ctx.user.role === "admin"; const currentHash = await db.getResidentPasswordHash(ctx.user.id); const currentOk = currentHash ? await verifyPassword(input.currentPassword, currentHash) : isAdminUser ? safeEqual(input.currentPassword, ENV.adminPassword) : false; if (!currentOk) throw new TRPCError({ code: "UNAUTHORIZED", message: "A senha atual está incorreta." }); const confirmation = await db.getPasswordChangeChallenge(ctx.user.id, input.confirmationId); if (!confirmation || !confirmation.confirmedAt || confirmation.usedAt || confirmation.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Confirme a identidade novamente antes de trocar a senha." }); if (isAdminUser) await db.setAdminPasswordHash(ctx.user.id, ENV.adminUsername || "gestao", await hashPassword(input.newPassword)); else await db.updateResidentPassword(ctx.user.id, await hashPassword(input.newPassword)); await db.consumePasswordChangeChallenge(confirmation.id); return { success: true } as const; }),
    logout: publicProcedure.input(z.object({ pushToken: z.string().max(512).optional() }).optional()).mutation(async ({ ctx, input }) => {
      // Remove o token de push deste aparelho: sem isso, quem saiu da conta continuava recebendo notificações dela.
      if (ctx.user && input?.pushToken) await db.deleteNotificationToken(ctx.user.id, input.pushToken).catch(() => undefined);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      const expiredOptions = { ...cookieOptions, maxAge: -1 };
      ctx.res.clearCookie("app_session_id", expiredOptions);
      ctx.res.clearCookie(COOKIE_NAME, expiredOptions);
      return { success: true } as const;
    }),
    sessions: protectedProcedure.query(({ ctx }) => db.listAuthSessions(ctx.user.id)),
    revokeSession: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.revokeAuthSession(ctx.user.id, input.id); return { success: true } as const; }),
    revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => { await db.revokeAllAuthSessions(ctx.user.id); return { success: true } as const; }),
  }),
  notifications: router({
    registerDevice: protectedProcedure.input(z.object({ token: z.string().min(20).max(512), platform: z.string().regex(/^(android|ios|(fcm|expo):[a-z0-9]{6,20})$/) })).mutation(async ({ ctx, input }) => {
      const result = await db.upsertNotificationToken({ userId: ctx.user.id, token: input.token, platform: input.platform });
      await db.deleteLegacyDeviceTokens(ctx.user.id).catch(() => undefined);
      // "fcm:<id>" / "expo:<id>" identifica a instalação: remove tokens antigos do MESMO aparelho (token renovado ou trocado de tipo) para não duplicar notificações.
      const installId = input.platform.split(":")[1];
      if (installId) await db.deleteOtherDeviceTokens(installId, input.token).catch(() => undefined);
      return result;
    }),
    /** Informa ao app qual via de push o servidor sabe usar (FCM direto, gratuito, ou Expo). */
    pushConfig: publicProcedure.query(() => ({ fcm: fcmConfigured() })),
    unregisterDevice: protectedProcedure.input(z.object({ token: z.string().min(20).max(512) })).mutation(({ ctx, input }) => db.deleteNotificationToken(ctx.user.id, input.token)),
    testPush: adminProcedure.mutation(({ ctx }) => notifyTestPush(ctx.user.id)),
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureResidentProfileComplete(ctx.user);
      const items = await db.listAppNotifications(ctx.user.id);
      return items.map((item) => ({
        ...item,
        data: item.data ? (() => { try { return JSON.parse(item.data); } catch { return {}; } })() : {},
      }));
    }),
    weeklySummary: protectedProcedure.query(async ({ ctx }) => { await ensureResidentProfileComplete(ctx.user); return db.getWeeklyNotificationSummary(ctx.user.id); }),
    trash: protectedProcedure.query(async ({ ctx }) => {
      await ensureResidentProfileComplete(ctx.user);
      const items = await db.listTrashedAppNotifications(ctx.user.id);
      return items.map((item) => ({
        ...item,
        data: item.data ? (() => { try { return JSON.parse(item.data); } catch { return {}; } })() : {},
      }));
    }),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.markAppNotificationRead(ctx.user.id, input.id)),
    markAllRead: protectedProcedure.mutation(({ ctx }) => db.markAllAppNotificationsRead(ctx.user.id)),
    moveToTrash: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.moveAppNotificationToTrash(ctx.user.id, input.id)),
    moveToTrashMany: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })).mutation(({ ctx, input }) => db.moveAppNotificationsToTrash(ctx.user.id, input.ids)),
    restore: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.restoreAppNotification(ctx.user.id, input.id)),
    restoreMany: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })).mutation(({ ctx, input }) => db.restoreAppNotifications(ctx.user.id, input.ids)),
    deletePermanently: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.permanentlyDeleteAppNotification(ctx.user.id, input.id)),
    deletePermanentlyMany: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })).mutation(({ ctx, input }) => db.permanentlyDeleteAppNotifications(ctx.user.id, input.ids)),
    // Compatibilidade com versões anteriores: o apagar antigo agora envia para a lixeira.
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.moveAppNotificationToTrash(ctx.user.id, input.id)),
    deleteMany: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })).mutation(({ ctx, input }) => db.moveAppNotificationsToTrash(ctx.user.id, input.ids)),
    preferences: protectedProcedure.query(async ({ ctx }) => { await ensureResidentProfileComplete(ctx.user); return db.listNotificationPreferences(ctx.user.id); }),
    updatePreference: protectedProcedure.input(z.object({ category: z.enum(["announcements", "requests", "suggestions", "account"]), enabled: z.boolean() })).mutation(async ({ ctx, input }) => { await ensureResidentProfileComplete(ctx.user); return db.upsertNotificationPreference(ctx.user.id, input.category, input.enabled); }),
  }),
  requests: router({
    mine: protectedProcedure.query(async ({ ctx }) => { await ensureResidentProfileComplete(ctx.user); return db.listUserRequests(ctx.user.id); }),
    activity: protectedProcedure.query(async ({ ctx }) => { await ensureResidentProfileComplete(ctx.user); const [residentRequests, statusUpdates] = await Promise.all([db.listUserRequests(ctx.user.id), db.listUserRequestUpdates(ctx.user.id)]); return { requests: residentRequests, updates: statusUpdates }; }),
    create: protectedProcedure.input(z.object({
      category: categorySchema,
      description: z.string().min(10).max(5000),
      fullAddress: z.string().min(5).max(1000),
      cep: z.string().regex(/^\d{5}-?\d{3}$/).optional(),
      neighborhood: z.string().min(2).max(120),
      referencePoint: z.string().max(500).optional(),
      photoUrl: z.string().url().optional(),
      photoDataBase64: z.string().max(4_194_304).optional(),
      photoContentType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
      clientOperationId: z.string().min(16).max(128).optional(),
    })).mutation(async ({ ctx, input }) => {
      await ensureResidentProfileComplete(ctx.user);
      const { photoDataBase64, photoContentType, clientOperationId, ...requestData } = input;
      if (clientOperationId) {
        const previous = await db.getClientOperation(ctx.user.id, clientOperationId);
        if (previous?.operation === "requests.create") {
          try { return JSON.parse(previous.result).requestId as number; } catch { /* registro antigo inválido: segue sem reutilizar */ }
        }
      }
      let photoUrl = requestData.photoUrl;
      if (photoDataBase64) {
        const stored = await storagePut(`requests/${ctx.user.id}/${Date.now()}.jpg`, Buffer.from(photoDataBase64, "base64"), photoContentType ?? "image/jpeg");
        photoUrl = stored.url;
      }
      const neighborhood = await canonicalNeighborhood(requestData.neighborhood);
      const requestId = await db.createRequest({ ...requestData, neighborhood, photoUrl, userId: ctx.user.id });
      if (clientOperationId) await db.saveClientOperation({ userId: ctx.user.id, operationId: clientOperationId, operation: "requests.create", result: JSON.stringify({ requestId }) });
      emit({ scopes: ["requests", "dashboard"], userIds: [ctx.user.id], admins: true });
      void notifyNewRequest({ requestId, residentName: ctx.user.name ?? undefined, category: input.category, neighborhood });
      return requestId;
    }),
    all: adminProcedure.input(z.object({ status: statusSchema.optional(), category: categorySchema.optional(), neighborhood: z.string().max(120).optional() }).optional()).query(async ({ ctx, input }) => db.listAllRequests({ ...input, neighborhood: (await getAdminNeighborhoodScope(ctx.user)) ?? input?.neighborhood })),
    updateStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: statusSchema, message: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      await db.assertRequestNeighborhood(input.id, await getAdminNeighborhoodScope(ctx.user));
      const userId = await db.updateRequestStatus({ ...input, adminId: ctx.user.id });
      await notifyRequestStatusChanged({ userId, requestId: input.id, status: input.status, message: input.message });
      emit({ scopes: ["requests", "dashboard"], admins: true });
      void recordAdminAction(ctx.user.id, { action: "request_status", targetType: "request", targetId: input.id, targetUserId: userId, summary: `Solicitação #${input.id} alterada para ${input.status}.`, metadata: { status: input.status, message: input.message ?? null } });
      return { success: true } as const;
    }),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await db.assertRequestNeighborhood(input.id, await getAdminNeighborhoodScope(ctx.user));
      const targetUserId = await db.getRequestOwnerId(input.id);
      await db.deleteRequest(input.id);
      emit({ scopes: ["requests", "dashboard"], admins: true, userIds: targetUserId ? [targetUserId] : [] });
      void recordAdminAction(ctx.user.id, { action: "request_delete", targetType: "request", targetId: input.id, targetUserId, summary: `Solicitação #${input.id} excluída.`, metadata: {} });
      return { success: true } as const;
    }),
    deleteMany: adminProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      const scope = await getAdminNeighborhoodScope(ctx.user);
      for (const id of input.ids) {
        await db.assertRequestNeighborhood(id, scope);
        const targetUserId = await db.getRequestOwnerId(id);
        await db.deleteRequest(id);
        emit({ scopes: ["requests", "dashboard"], admins: true, userIds: targetUserId ? [targetUserId] : [] });
        void recordAdminAction(ctx.user.id, { action: "request_delete", targetType: "request", targetId: id, targetUserId, summary: `Solicitação #${id} excluída.`, metadata: { bulk: true } });
      }
      return { success: true, count: input.ids.length } as const;
    }),
    updateMine: protectedProcedure.input(z.object({ id: z.number().int().positive(), category: categorySchema, description: z.string().min(10).max(5000), fullAddress: z.string().min(5).max(1000), referencePoint: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => { await ensureResidentProfileComplete(ctx.user); const { id, ...data } = input; return db.updateOwnRequest(ctx.user.id, id, data); }),
  }),
  suggestions: router({
    mine: protectedProcedure.query(async ({ ctx }) => { await ensureResidentProfileComplete(ctx.user); return db.listUserSuggestions(ctx.user.id); }),
    create: protectedProcedure.input(z.object({ title: z.string().min(3).max(255), description: z.string().min(10).max(5000), photoUrl: z.string().url().optional() })).mutation(async ({ ctx, input }) => { await ensureResidentProfileComplete(ctx.user); const neighborhood = await db.getUserNeighborhood(ctx.user.id); const suggestionId = await db.createSuggestion({ ...input, neighborhood, userId: ctx.user.id }); emit({ scopes: ["suggestions", "dashboard"], admins: true, userIds: [ctx.user.id] }); void notifyNewSuggestion({ suggestionId, residentName: ctx.user.name ?? undefined, title: input.title }); return suggestionId; }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(3).max(255), description: z.string().min(10).max(5000) })).mutation(async ({ ctx, input }) => { const userId = await db.getSuggestionOwnerId(input.id); await db.updateSuggestion(input.id, { title: input.title, description: input.description }); if (userId) void notifySuggestionUpdated({ userId, suggestionId: input.id, title: input.title }); void recordAdminAction(ctx.user.id, { action: "suggestion_update", targetType: "suggestion", targetId: input.id, targetUserId: userId, summary: `Sugestão #${input.id} atualizada.`, metadata: { title: input.title } }); return { success: true } as const; }),
    updateMine: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(3).max(255), description: z.string().min(10).max(5000) })).mutation(async ({ ctx, input }) => { await ensureResidentProfileComplete(ctx.user); return db.updateOwnSuggestion(ctx.user.id, input.id, { title: input.title, description: input.description }); }),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const targetUserId = await db.getSuggestionOwnerId(input.id); await db.deleteSuggestion(input.id); void recordAdminAction(ctx.user.id, { action: "suggestion_delete", targetType: "suggestion", targetId: input.id, targetUserId, summary: `Sugestão #${input.id} excluída.`, metadata: {} }); return { success: true } as const; }),
    all: adminProcedure.input(z.object({ neighborhood: z.string().max(120).optional() }).optional()).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) return [];
      const { suggestions } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await database.select().from(suggestions).where(input?.neighborhood ? eq(suggestions.neighborhood, input.neighborhood) : undefined);
      return rows.map(({ encryptedData: _ciphertext, ...row }) => row);
    }),
  }),
  announcements: router({
    list: protectedProcedure.query(async ({ ctx }) => { await ensureResidentProfileComplete(ctx.user); const credential = ctx.user.role === "user" ? await db.getResidentCredentialByUserId(ctx.user.id) : undefined; return db.listAnnouncements(ctx.user.id, ctx.user.role, credential?.neighborhood); }),
    like: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await ensureResidentProfileComplete(ctx.user); const result = await db.toggleAnnouncementLike(input.id, ctx.user.id); emit({ scopes: ["announcements"], everyone: true }); return result; }),
    likeUsers: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => db.listAnnouncementLikeUsers(input.id)),
    create: adminProcedure.input(z.object({ title: z.string().min(3).max(255), content: z.string().min(10).max(10000), category: z.enum(["event", "notice", "urgent", "general", "civil_defense"]), audience: z.enum(["all", "residents", "admins"]).default("all"), neighborhood: z.string().max(120).optional() })).mutation(async ({ ctx, input }) => { const announcementId = await db.createAnnouncement({ ...input, neighborhood: input.neighborhood?.trim() || null, adminId: ctx.user.id }); emit({ scopes: ["announcements"], neighborhood: input.neighborhood?.trim() || null });
 void notifyAnnouncement({ announcementId, title: input.title, category: input.category, neighborhood: input.neighborhood?.trim() || null }); void recordAdminAction(ctx.user.id, { action: "announcement_create", targetType: "announcement", targetId: announcementId, summary: `Comunicado “${input.title}” publicado.`, metadata: { category: input.category, audience: input.audience, neighborhood: input.neighborhood ?? null } }); return announcementId; }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(3).max(255), content: z.string().min(10).max(10000), category: z.enum(["event", "notice", "urgent", "general", "civil_defense"]), audience: z.enum(["all", "residents", "admins"]).default("all"), neighborhood: z.string().max(120).optional() })).mutation(async ({ ctx, input }) => { await db.updateAnnouncement(input.id, { title: input.title, content: input.content, category: input.category, audience: input.audience, neighborhood: input.neighborhood?.trim() || null }); emit({ scopes: ["announcements"], everyone: true });
 void notifyAnnouncement({ announcementId: input.id, title: `Comunicado atualizado: ${input.title}`, category: input.category, neighborhood: input.neighborhood?.trim() || null }); void recordAdminAction(ctx.user.id, { action: "announcement_update", targetType: "announcement", targetId: input.id, summary: `Comunicado #${input.id} atualizado.`, metadata: { category: input.category, audience: input.audience, neighborhood: input.neighborhood ?? null } }); return { success: true } as const; }),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.deleteAnnouncement(input.id); emit({ scopes: ["announcements"], everyone: true }); void recordAdminAction(ctx.user.id, { action: "announcement_delete", targetType: "announcement", targetId: input.id, summary: `Comunicado #${input.id} excluído.`, metadata: {} }); return { success: true } as const; }),
  }),
  users: router({
    all: adminProcedure.input(z.object({ neighborhood: z.string().max(120).optional() }).optional()).query(({ input }) => db.listUsers(input?.neighborhood)),
    updateStatus: adminProcedure.input(z.object({ userId: z.number().int().positive(), residentStatus: residentStatusSchema })).mutation(async ({ ctx, input }) => { const result = await db.updateResidentStatus(input.userId, input.residentStatus); emit({ scopes: ["residents", "dashboard", "me"], admins: true, userIds: [input.userId] }); void notifyResidentStatus(result); void recordAdminAction(ctx.user.id, { action: "user_status", targetType: "user", targetId: input.userId, targetUserId: input.userId, summary: `Status do usuário #${input.userId} alterado para ${input.residentStatus}.`, metadata: { residentStatus: input.residentStatus } }); return result; }),
    delete: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.deleteResident(input.userId); emit({ scopes: ["residents", "dashboard"], admins: true }); void recordAdminAction(ctx.user.id, { action: "user_delete", targetType: "user", targetId: input.userId, targetUserId: input.userId, summary: `Cadastro do usuário #${input.userId} excluído.`, metadata: {} }); return { success: true } as const; }),
  }),
  residents: router({
    all: adminProcedure.input(z.object({ neighborhood: z.string().max(120).optional() }).optional()).query(({ input }) => db.listResidents(input?.neighborhood)),
    updateStatus: adminProcedure.input(z.object({ userId: z.number().int().positive(), residentStatus: residentStatusSchema })).mutation(async ({ ctx, input }) => { const result = await db.updateResidentStatus(input.userId, input.residentStatus); emit({ scopes: ["residents", "dashboard", "me"], admins: true, userIds: [input.userId] }); void notifyResidentStatus(result); void recordAdminAction(ctx.user.id, { action: "user_status", targetType: "user", targetId: input.userId, targetUserId: input.userId, summary: `Status do morador #${input.userId} alterado para ${input.residentStatus}.`, metadata: { residentStatus: input.residentStatus } }); return result; }),
    delete: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await db.deleteResident(input.userId); emit({ scopes: ["residents", "dashboard"], admins: true }); void recordAdminAction(ctx.user.id, { action: "user_delete", targetType: "user", targetId: input.userId, targetUserId: input.userId, summary: `Cadastro do morador #${input.userId} excluído.`, metadata: {} }); return { success: true } as const; }),
    resetPassword: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const credential = await db.getResidentCredentialByUserId(input.userId);
      if (!credential) throw new TRPCError({ code: "NOT_FOUND", message: "Este cadastro não possui credencial de morador." });
      const temporaryPassword = `CB-${randomBytes(5).toString("hex").toUpperCase()}`;
      await db.updateResidentPassword(input.userId, await hashPassword(temporaryPassword));
      void recordAdminAction(ctx.user.id, { action: "user_password_reset", targetType: "user", targetId: input.userId, targetUserId: input.userId, summary: `Senha temporária gerada para o morador #${input.userId}.`, metadata: { delivery: "manual" } });
      return { username: credential.username, temporaryPassword } as const;
    }),
  }),
  audit: router({
    list: adminProcedure.input(z.object({ targetUserId: z.number().int().positive().optional(), action: z.string().max(64).optional(), limit: z.number().int().min(1).max(250).optional() }).optional()).query(({ input }) => db.listAdminAuditLogs(input)),
    delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { await db.deleteAdminAuditLog(input.id); return { success: true } as const; }),
    deleteMany: adminProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(250) })).mutation(async ({ input }) => { await db.deleteAdminAuditLogs(input.ids); return { success: true, count: input.ids.length } as const; }),
  }),
  telemetry: router({
    record: protectedProcedure.input(z.object({
      endpoint: z.string().min(1).max(240),
      method: z.string().min(1).max(12),
      status: z.number().int().min(0).max(999).nullable().optional(),
      errorCode: z.string().max(64).nullable().optional(),
      message: z.string().min(1).max(240),
      durationMs: z.number().int().min(0).max(2_147_483_647),
      platform: z.enum(["android", "ios", "web", "unknown"]),
      appVersion: z.string().min(1).max(32),
    })).mutation(async ({ ctx, input }) => {
      const id = await db.createNetworkTelemetryEvent({
        userId: ctx.user.id,
        ...input,
        status: input.status ?? null,
        errorCode: input.errorCode ?? null,
      });
      return { success: true, id } as const;
    }),
    list: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(250).optional() }).optional()).query(({ input }) => db.listNetworkTelemetryEvents(input?.limit)),
  }),
  social: router({
    get: publicProcedure.query(async () => { const saved = await db.getSocialLinks(); return { website: saved.website || OFFICIAL_CHANNELS.website, instagram: saved.instagram || OFFICIAL_CHANNELS.instagram, facebook: saved.facebook || OFFICIAL_CHANNELS.facebook, youtube: saved.youtube || OFFICIAL_CHANNELS.youtube, whatsapp: saved.whatsapp || ENV.whatsappUrl || OFFICIAL_CHANNELS.whatsapp || null }; }),
    update: adminProcedure.input(z.object({ instagram: z.string().url().or(z.literal("")), facebook: z.string().url().or(z.literal("")), whatsapp: z.string().url().or(z.literal("")), youtube: z.string().url().or(z.literal("")).optional(), website: z.string().url().or(z.literal("")).optional() })).mutation(async ({ input }) => { const result = await db.updateSocialLinks({ instagram: input.instagram || null, facebook: input.facebook || null, whatsapp: input.whatsapp || null, youtube: input.youtube || null, website: input.website || null }); emit({ scopes: ["social"], everyone: true }); return result; }),
  }),
  reports: router({
    waterShortage: adminProcedure.input(z.object({ neighborhood: z.string().max(120).optional() }).optional()).query(async ({ ctx, input }) => db.listWaterShortageRequests((await getAdminNeighborhoodScope(ctx.user)) ?? input?.neighborhood)),
    markWaterShortageAttended: adminProcedure.input(z.object({ id: z.number().int().positive(), attended: z.boolean() })).mutation(async ({ ctx, input }) => { await db.assertRequestNeighborhood(input.id, await getAdminNeighborhoodScope(ctx.user)); const result = await db.markWaterShortageAttended(input.id, input.attended); void notifyRequestStatusChanged(result); return result; }),
  }),
  address: router({
    /** Busca automática de endereço por CEP (público: usado também no cadastro). */
    lookupCep: publicProcedure.input(z.object({ cep: z.string().regex(/^\d{5}-?\d{3}$/, "Informe um CEP com 8 dígitos.") })).query(async ({ input }) => {
      let result;
      try { result = await lookupCep(input.cep); } catch (error) { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error instanceof Error ? error.message : "Serviço de CEP indisponível." }); }
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "CEP não encontrado. Confira os números digitados." });
      if (!result.inCity) throw new TRPCError({ code: "BAD_REQUEST", message: `Este CEP pertence a ${result.city || "outra cidade"}${result.state ? `-${result.state}` : ""}. O Conecta Barra atende apenas Barra do Piraí-RJ.` });
      return result;
    }),
  }),
  neighborhoods: router({
    list: publicProcedure.query(() => db.listNeighborhoods(true)),
    listAll: adminProcedure.query(() => db.listNeighborhoods(false)),
    add: adminProcedure.input(z.object({ name: z.string().min(2).max(120), area: z.string().min(2).max(60).default("Sede") })).mutation(async ({ input }) => { await db.upsertNeighborhood(input.name.trim(), input.area, "admin"); emit({ scopes: ["neighborhoods"], everyone: true }); return { success: true } as const; }),
    setActive: adminProcedure.input(z.object({ id: z.number().int().positive(), active: z.boolean() })).mutation(async ({ input }) => { await db.setNeighborhoodActive(input.id, input.active); emit({ scopes: ["neighborhoods"], everyone: true }); return { success: true } as const; }),
    /** Painel do bairro: números agregados e anônimos. */
    overview: protectedProcedure.input(z.object({ neighborhood: z.string().min(2).max(120).optional() }).optional()).query(async ({ ctx, input }) => {
      await ensureResidentProfileComplete(ctx.user);
      const own = ctx.user.role === "user" ? await db.getUserNeighborhood(ctx.user.id) : null;
      const target = input?.neighborhood ?? own;
      if (!target) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um bairro no seu perfil para ver o painel." });
      if (ctx.user.role === "user" && normalizeName(target) !== normalizeName(own)) throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode ver o painel do seu bairro." });
      return db.getNeighborhoodOverview(target);
    }),
  }),
  portal: router({
    news: publicProcedure.query(() => fetchPortalNews()),
  }),
  backup: router({
    list: adminProcedure.query(() => db.listBackupSnapshots()),
    create: adminProcedure.input(z.object({ label: z.string().min(3).max(160) })).mutation(async ({ ctx, input }) => { const payload = await db.exportBackupData(); const serialized = JSON.stringify(payload); const checksum = createHash("sha256").update(serialized).digest("hex"); const id = await db.createBackupSnapshot({ createdBy: ctx.user.id, label: input.label, payload: serialized, checksum }); void recordAdminAction(ctx.user.id, { action: "backup_create", targetType: "backup", targetId: id, summary: `Backup ${id} criado.`, metadata: { checksum } }); return { id, checksum, createdAt: new Date() } as const; }),
    restore: adminProcedure.input(z.object({ id: z.number().int().positive(), confirmation: z.literal("RESTAURAR CONECTA") })).mutation(async ({ ctx, input }) => { const snapshot = await db.getBackupSnapshot(input.id); if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Backup não encontrado." }); let payload: Awaited<ReturnType<typeof db.exportBackupData>>; try { payload = JSON.parse(snapshot.payload) as Awaited<ReturnType<typeof db.exportBackupData>>; } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Backup inválido." }); } const checksum = createHash("sha256").update(snapshot.payload).digest("hex"); if (checksum !== snapshot.checksum) throw new TRPCError({ code: "BAD_REQUEST", message: "A integridade do backup não pôde ser confirmada." }); await db.restoreBackupData(payload); void recordAdminAction(ctx.user.id, { action: "backup_restore", targetType: "backup", targetId: snapshot.id, summary: `Backup ${snapshot.id} restaurado.`, metadata: { checksum } }); return { success: true } as const; }),
  }),
});

export type AppRouter = typeof appRouter;
