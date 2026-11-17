import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { notifyResidentRegistration } from "./push";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [salt, storedHex] = encoded.split(":");
  if (!salt || !storedHex) return false;
  const stored = Buffer.from(storedHex, "hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

/** Comparação em tempo constante de dois textos (compara o SHA-256 de cada um, então o tamanho não vaza). */
export function safeEqual(a: string, b: string) {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

export async function persistSession(userId: number, token: string, req: { headers: Record<string, string | string[] | undefined> }) {
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "Dispositivo não identificado";
  const platform = typeof req.headers["x-platform"] === "string" ? req.headers["x-platform"] : "web/native";
  const deviceLabel = (typeof req.headers["x-device-name"] === "string" ? req.headers["x-device-name"] : userAgent).slice(0, 120);
  await db.createAuthSession({ userId, tokenHash: createHash("sha256").update(token).digest("hex"), deviceLabel, platform: platform.slice(0, 32), expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) });
}

/** Remove do objeto de usuário o que o aplicativo não precisa receber (dados criptografados internos). */
export function publicUser<T extends { encryptedData?: unknown }>(user: T): Omit<T, "encryptedData"> {
  const { encryptedData: _ignored, ...rest } = user;
  return rest;
}

export function isProfileComplete(credential: { username?: string | null; address?: string | null; cep?: string | null; street?: string | null; number?: string | null; neighborhood?: string | null; phone?: string | null; sex?: string | null } | undefined | null) {
  return Boolean(credential?.username && credential.address && credential.cep && credential.street && credential.number && credential.neighborhood && credential.phone && credential.sex);
}

/**
 * Cria (ou reaproveita) o morador a partir de uma conta Google JÁ VERIFICADA e devolve a sessão do app.
 * Usado tanto pelo fluxo no servidor (/api/auth/google/*) quanto pela mutation `auth.loginGoogle`.
 */
export async function signInWithGoogleProfile(
  payload: { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown },
  req: { headers: Record<string, string | string[] | undefined> },
) {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!sub || !email || !verified) throw new TRPCError({ code: "UNAUTHORIZED", message: "A conta Google não forneceu um e-mail verificado." });

  const googleName = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "";
  const openId = `google_${sub}`;
  const username = `google_${sub}`.slice(0, 64);

  let user = await db.getUserByOpenId(openId);
  if (!user) {
    // Vincula a um cadastro de morador já existente apenas se o e-mail dele foi CONFIRMADO (evita sequestro de cadastro pendente).
    const byEmail = await db.getResidentCredentialByEmail(email);
    if (byEmail?.userId && byEmail.emailVerifiedAt) {
      const linked = await db.getUserById(byEmail.userId);
      if (linked && linked.role === "user") user = linked;
    }
  }

  if (!user) {
    await db.upsertUser({ openId, name: googleName || email.split("@")[0], email, loginMethod: "google", role: "user", residentStatus: ENV.requireResidentApproval ? "pending" : "approved", lastSignedIn: new Date() });
    user = await db.getUserByOpenId(openId);
    if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o acesso Google. Tente novamente." });
    void notifyResidentRegistration({ userId: user.id, residentName: user.name ?? googleName });
  } else {
    await db.upsertUser({ openId: user.openId, name: user.name || googleName || undefined, email: user.email || email, lastSignedIn: new Date() });
    user = (await db.getUserById(user.id)) ?? user;
  }

  // Garante a ficha cadastral (perfil) — sem ela o morador nunca conseguiria completar o cadastro.
  let credential = await db.getResidentCredentialByUserId(user.id);
  if (!credential && user.role === "user") {
    try {
      await db.createResidentCredential({ userId: user.id, username, passwordHash: await hashPassword(randomBytes(32).toString("hex")), address: null, cep: null, street: null, number: null, neighborhood: null, phone: "", sex: "prefer_not_to_say", email, emailVerifiedAt: new Date() });
    } catch (error) {
      // Corrida entre duas tentativas simultâneas: se a ficha já existe, segue em frente.
      credential = await db.getResidentCredentialByUserId(user.id);
      if (!credential) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o cadastro do morador. Tente novamente.", cause: error });
    }
    credential = await db.getResidentCredentialByUserId(user.id);
  }

  if (user.role === "user" && user.residentStatus === "blocked") throw new TRPCError({ code: "FORBIDDEN", message: "Seu cadastro está bloqueado. Procure a gestão do Conecta Barra." });

  const token = await sdk.signSession({ openId: user.openId, appId: "conecta-barra", name: user.name ?? email });
  await persistSession(user.id, token, req);
  return { user: publicUser(user), token, profileComplete: user.role === "admin" ? true : isProfileComplete(credential) };
}
