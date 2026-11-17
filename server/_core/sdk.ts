import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import { ForbiddenError } from "../../shared/_core/errors.js";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomUUID } from "node:crypto";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = { openId: string; appId: string; name: string };

class SDKServer {
  private secret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}): Promise<string> {
    const expiresAt = Math.floor((Date.now() + (options.expiresInMs ?? ONE_YEAR_MS)) / 1000);
    return new SignJWT({ openId: payload.openId, appId: payload.appId, name: payload.name })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setJti(randomUUID())
      .setExpirationTime(expiresAt)
      .sign(this.secret());
  }

  async verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.secret(), { algorithms: ["HS256"] });
      const { openId, appId, name } = payload as Record<string, unknown>;
      if (typeof openId !== "string" || !openId || typeof appId !== "string" || !appId || typeof name !== "string" || !name) return null;
      return { openId, appId, name };
    } catch {
      return null;
    }
  }

  /** Valida um token JWT (header Bearer, cookie ou WebSocket) e devolve o usuário. */
  async authenticateToken(token: string | undefined | null): Promise<User> {
    const session = await this.verifySession(token);
    if (!session) throw ForbiddenError("Sessão inválida");
    const tokenHash = createHash("sha256").update(token ?? "").digest("hex");
    const state = await db.getAuthSessionState(tokenHash);
    if (state.databaseAvailable && state.session) {
      if (state.session.revokedAt) throw ForbiddenError("Sessão encerrada remotamente");
      if (new Date(state.session.expiresAt).getTime() <= Date.now()) throw ForbiddenError("Sessão expirada");
    }
    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("Usuário não encontrado");
    if (state.databaseAvailable && state.session) void db.touchAuthSession(tokenHash);
    return user;
  }

  async authenticateRequest(req: Request): Promise<User> {
    const header = req.headers.authorization;
    const bearer = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
    const cookies = req.headers.cookie ? parseCookieHeader(req.headers.cookie) : {};
    return this.authenticateToken(bearer || cookies[COOKIE_NAME] || cookies["manus_session"]);
  }
}

export const sdk = new SDKServer();
