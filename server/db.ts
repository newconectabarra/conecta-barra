import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne, not } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import {
  adminAuditLogs,
  networkTelemetryEvents,
  emailDeliveryLogs,
  announcements,
  announcementLikes,
  appNotifications,
  notificationPreferences,
  notificationTokens,
  InsertUser,
  requestUpdates,
  requests,
  residentCredentials,
  emailVerificationCodes,
  suggestions,
  socialLinks,
  users,
  authSessions,
  backupSnapshots,
  passwordChangeChallenges,
  passwordResetCodes,
  clientOperations,
  neighborhoods,
} from "../drizzle/schema";
import { SEED_NEIGHBORHOODS, normalizeName } from "../shared/neighborhoods";
import { ENV } from "./_core/env";
import { openFields, sealFields } from "./_core/field-encryption";


let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof createPool> | null = null;

function getInsertId(result: unknown) {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { insertId?: number } | undefined)?.insertId ?? 0);
}

function decryptFields<T extends { encryptedData?: string | null }>(row: T | undefined): T | undefined {
  if (!row?.encryptedData) return row;
  return { ...row, ...openFields(row.encryptedData), encryptedData: row.encryptedData } as T;
}

function encryptedPayload(row: Record<string, unknown>, fields: string[]) {
  return sealFields(Object.fromEntries(fields.map((field) => [field, row[field] as string | null | undefined])));
}

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      const url = new URL(ENV.databaseUrl);
      const requestedLimit = Number.parseInt(process.env.DB_CONNECTION_LIMIT ?? "3", 10);
      const connectionLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10) : 3;
      _pool = createPool({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "test",
        waitForConnections: true,
        connectionLimit,
        maxIdle: 1,
        idleTimeout: 10_000,
        queueLimit: 0,
        // Conexões "meio mortas" (TiDB/Render/NAT fecham sockets ociosos em silêncio) causavam ECONNRESET
        // na primeira consulta depois de um período parado. Keep-alive TCP + timeout de conexão evitam isso.
        enableKeepAlive: true,
        keepAliveInitialDelay: 10_000,
        connectTimeout: 15_000,
        ...(ENV.databaseSsl ? { ssl: { rejectUnauthorized: true, verifyIdentity: true, minVersion: "TLSv1.2" } } : {}),
      });
      _pool.on("connection", (connection) => { connection.on("error", (error) => console.warn("[Database] erro de conexão (será recriada):", error.message)); });
      _db = drizzle(_pool) as unknown as ReturnType<typeof drizzle>;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

/** openId da única conta administrativa (login por ADMIN_USERNAME/ADMIN_PASSWORD). */
export const ADMIN_OPEN_ID = "admin_gestao";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const existingRows = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
  const existing = decryptFields(existingRows[0]);
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date(), encryptedData: sealFields({ name: user.name ?? existing?.name, email: user.email ?? existing?.email, avatarUrl: user.avatarUrl ?? existing?.avatarUrl }) };
  const updateSet: Record<string, unknown> = { lastSignedIn: user.lastSignedIn ?? new Date() };
  for (const field of ["name", "avatarUrl", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.residentStatus !== undefined) {
    values.residentStatus = user.residentStatus;
    updateSet.residentStatus = user.residentStatus;
  }
  if (user.role !== undefined) {
    // Há UMA única conta administrativa (openId fixo). Qualquer outro openId nunca recebe o papel "admin".
    values.role = user.openId === ADMIN_OPEN_ID ? (user.role ?? "admin") : "user";
    if (user.openId === ADMIN_OPEN_ID) updateSet.role = values.role;
  }
  updateSet.encryptedData = values.encryptedData;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function updateUserAvatar(userId: number, avatarUrl: string | null) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const current = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  const existing = decryptFields(current[0]);
  await database.update(users).set({ avatarUrl, encryptedData: encryptedPayload({ name: existing?.name, email: existing?.email, avatarUrl }, ["name", "email", "avatarUrl"]) }).where(eq(users.id, userId));
  const updated = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  return decryptFields(updated[0]);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return decryptFields(result[0]);
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return decryptFields(result[0]);
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return decryptFields(result[0]);
}

export async function createRequest(data: typeof requests.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(requests).values({ ...data, encryptedData: sealFields({ description: data.description, fullAddress: data.fullAddress, cep: data.cep, neighborhood: data.neighborhood, referencePoint: data.referencePoint, photoUrl: data.photoUrl, adminMessage: data.adminMessage }) });
  const insertId = getInsertId(result);
  if (insertId > 0) return insertId;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const created = await db.select({ id: requests.id }).from(requests)
      .where(eq(requests.userId, data.userId))
      .orderBy(desc(requests.id)).limit(1);
    const recoveredId = Number(created[0]?.id ?? 0);
    if (recoveredId > 0) return recoveredId;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error("A solicitação foi gravada, mas o servidor não conseguiu recuperar seu identificador. Atualize a lista e tente novamente.");
}

export async function listUserRequests(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(requests).where(eq(requests.userId, userId)).orderBy(desc(requests.createdAt));
  return rows.map((row) => decryptFields(row)).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function listUserRequestUpdates(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: requestUpdates.id,
    requestId: requestUpdates.requestId,
    category: requests.category,
    status: requestUpdates.status,
    message: requestUpdates.message,
    createdAt: requestUpdates.createdAt,
  }).from(requestUpdates)
    .innerJoin(requests, eq(requestUpdates.requestId, requests.id))
    .where(eq(requests.userId, userId))
    .orderBy(desc(requestUpdates.createdAt))
    .limit(100);
}

export async function listAllRequests(filters?: { status?: typeof requests.status.enumValues[number]; category?: typeof requests.category.enumValues[number]; neighborhood?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(requests.status, filters.status));
  if (filters?.category) conditions.push(eq(requests.category, filters.category));
  if (filters?.neighborhood) conditions.push(eq(requests.neighborhood, filters.neighborhood));
  return db.select({
    id: requests.id,
    userId: requests.userId,
    category: requests.category,
    description: requests.description,
    fullAddress: requests.fullAddress,
    cep: requests.cep,
    neighborhood: requests.neighborhood,
    referencePoint: requests.referencePoint,
    photoUrl: requests.photoUrl,
    status: requests.status,
    adminMessage: requests.adminMessage,
    waterAttendedAt: requests.waterAttendedAt,
    createdAt: requests.createdAt,
    updatedAt: requests.updatedAt,
    requesterName: users.name,
    requesterUsername: residentCredentials.username,
    requesterAvatarUrl: users.avatarUrl,
  }).from(requests)
    .leftJoin(users, eq(requests.userId, users.id))
    .leftJoin(residentCredentials, eq(requests.userId, residentCredentials.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(requests.createdAt));
}

export async function getRequestOwnerId(id: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select({ userId: requests.userId }).from(requests).where(eq(requests.id, id)).limit(1);
  return result[0]?.userId;
}

export async function deleteRequest(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(requestUpdates).where(eq(requestUpdates.requestId, id));
  await db.delete(requests).where(eq(requests.id, id));
}

export async function deleteRequests(ids: number[]) {
  for (const id of ids) await deleteRequest(id);
}

export async function updateOwnRequest(userId: number, id: number, data: { category: typeof requests.category.enumValues[number]; description: string; fullAddress: string; referencePoint?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await db.select().from(requests).where(and(eq(requests.id, id), eq(requests.userId, userId))).limit(1);
  const existing = decryptFields(current[0]);
  await db.update(requests).set({ ...data, encryptedData: encryptedPayload({ description: data.description, fullAddress: data.fullAddress, cep: existing?.cep, neighborhood: existing?.neighborhood, referencePoint: data.referencePoint, photoUrl: existing?.photoUrl, adminMessage: existing?.adminMessage }, ["description", "fullAddress", "cep", "neighborhood", "referencePoint", "photoUrl", "adminMessage"]) }).where(and(eq(requests.id, id), eq(requests.userId, userId)));
  const updated = await db.select().from(requests).where(and(eq(requests.id, id), eq(requests.userId, userId))).limit(1);
  return updated.map((row) => decryptFields(row)).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function markWaterShortageAttended(id: number, attended: boolean) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const request = await database.select({ userId: requests.userId }).from(requests).where(and(eq(requests.id, id), eq(requests.category, "water_shortage"))).limit(1);
  if (!request[0]) throw new Error("Request not found");
  const status: typeof requests.status.enumValues[number] = attended ? "completed" : "received";
  const current = await database.select().from(requests).where(and(eq(requests.id, id), eq(requests.category, "water_shortage"))).limit(1);
  const existing = decryptFields(current[0]);
  await database.update(requests).set({ waterAttendedAt: attended ? new Date() : null, status, encryptedData: encryptedPayload({ description: existing?.description, fullAddress: existing?.fullAddress, cep: existing?.cep, neighborhood: existing?.neighborhood, referencePoint: existing?.referencePoint, photoUrl: existing?.photoUrl, adminMessage: existing?.adminMessage }, ["description", "fullAddress", "cep", "neighborhood", "referencePoint", "photoUrl", "adminMessage"]) }).where(and(eq(requests.id, id), eq(requests.category, "water_shortage")));
  return { userId: request[0].userId, requestId: id, status };
}

export async function updateRequestStatus(data: { id: number; adminId: number; status: typeof requests.status.enumValues[number]; message?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const request = await db.select({ userId: requests.userId }).from(requests).where(eq(requests.id, data.id)).limit(1);
  if (!request[0]) throw new Error("Request not found");
  const current = await db.select().from(requests).where(eq(requests.id, data.id)).limit(1);
  const existing = decryptFields(current[0]);
  await db.update(requests).set({ status: data.status, adminMessage: data.message ?? null, encryptedData: encryptedPayload({ description: existing?.description, fullAddress: existing?.fullAddress, cep: existing?.cep, neighborhood: existing?.neighborhood, referencePoint: existing?.referencePoint, photoUrl: existing?.photoUrl, adminMessage: data.message }, ["description", "fullAddress", "cep", "neighborhood", "referencePoint", "photoUrl", "adminMessage"]) }).where(eq(requests.id, data.id));
  await db.insert(requestUpdates).values({ requestId: data.id, adminId: data.adminId, status: data.status, message: data.message ?? null, encryptedData: sealFields({ message: data.message }) });
  return request[0].userId;
}

export async function listNotificationRecipients(roles?: Array<"user" | "admin">, neighborhood?: string | null) {
  const database = await getDb();
  if (!database) return [];
  const roleCondition = roles?.length ? inArray(users.role, roles) : undefined;
  // Moradores pendentes também recebem avisos; somente usuários bloqueados ficam fora.
  const rows = await database.select({ userId: users.id, role: users.role, status: users.residentStatus, neighborhood: residentCredentials.neighborhood })
    .from(users).leftJoin(residentCredentials, eq(users.id, residentCredentials.userId)).where(roleCondition);
  return rows.filter((row) => {
    if (row.status === "blocked") return false;
    if (!neighborhood || row.role === "admin") return true;
    return normalizeName(row.neighborhood) === normalizeName(neighborhood);
  }).map(({ userId, role }) => ({ userId, role }));
}

export async function getUserNeighborhood(userId: number) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database.select({ neighborhood: residentCredentials.neighborhood }).from(residentCredentials).where(eq(residentCredentials.userId, userId)).limit(1);
  return rows[0]?.neighborhood ?? null;
}

export async function seedNeighborhoods() {
  const database = await getDb();
  if (!database) return;
  const existing = await database.select({ name: neighborhoods.name }).from(neighborhoods);
  const known = new Set(existing.map((row) => normalizeName(row.name)));
  const missing = SEED_NEIGHBORHOODS.filter((item) => !known.has(normalizeName(item.name)));
  if (missing.length) await database.insert(neighborhoods).values(missing.map((item) => ({ ...item, source: "seed" })));
}

export async function listNeighborhoods(activeOnly = true) {
  const database = await getDb();
  if (!database) return SEED_NEIGHBORHOODS.map((item, index) => ({ id: index + 1, ...item, active: true, source: "seed", createdAt: new Date(0) }));
  return database.select().from(neighborhoods).where(activeOnly ? eq(neighborhoods.active, true) : undefined).orderBy(asc(neighborhoods.name));
}

export async function upsertNeighborhood(name: string, area = "Sede", source = "admin") {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.insert(neighborhoods).values({ name, area, source }).onDuplicateKeyUpdate({ set: { active: true } });
}

export async function setNeighborhoodActive(id: number, active: boolean) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(neighborhoods).set({ active }).where(eq(neighborhoods.id, id));
}

/** Painel transparente do bairro: números agregados, sem dados pessoais. */
export async function getNeighborhoodOverview(neighborhood: string) {
  const database = await getDb();
  if (!database) return { neighborhood, total: 0, open: 0, completed: 0, residents: 0, byCategory: [] as { category: string; value: number }[], recent: [] as { id: number; category: string; status: string; createdAt: Date }[] };
  const rows = await database.select({ id: requests.id, category: requests.category, status: requests.status, createdAt: requests.createdAt }).from(requests).where(eq(requests.neighborhood, neighborhood)).orderBy(desc(requests.createdAt));
  const residents = await database.select({ value: count() }).from(residentCredentials).innerJoin(users, eq(users.id, residentCredentials.userId)).where(and(eq(residentCredentials.neighborhood, neighborhood), not(eq(users.residentStatus, "blocked"))));
  const byCategory = new Map<string, number>();
  rows.forEach((row) => byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1));
  return {
    neighborhood,
    total: rows.length,
    open: rows.filter((row) => ["received", "reviewing", "forwarded", "in_progress"].includes(row.status)).length,
    completed: rows.filter((row) => row.status === "completed").length,
    residents: Number(residents[0]?.value ?? 0),
    byCategory: [...byCategory.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value),
    recent: rows.slice(0, 5),
  };
}

export async function upsertNotificationToken(data: { userId: number; token: string; platform: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const existing = await database.select({ id: notificationTokens.id })
    .from(notificationTokens)
    .where(eq(notificationTokens.token, data.token))
    .limit(1);
  if (existing[0]) {
    await database.update(notificationTokens).set({ userId: data.userId, platform: data.platform, updatedAt: new Date() }).where(eq(notificationTokens.id, existing[0].id));
  } else {
    await database.insert(notificationTokens).values(data);
  }
  return { success: true } as const;
}

export async function deleteNotificationToken(userId: number, token: string) {
  const database = await getDb();
  if (!database) return { success: true } as const;
  await database.delete(notificationTokens).where(and(eq(notificationTokens.userId, userId), eq(notificationTokens.token, token)));
  return { success: true } as const;
}

export async function listPushTokensForUsers(userIds: number[], category: string, respectPreferences = true) {
  const database = await getDb();
  if (!database || userIds.length === 0) return [];
  const tokens = await database.select({ userId: notificationTokens.userId, token: notificationTokens.token }).from(notificationTokens).where(inArray(notificationTokens.userId, userIds));
  if (!respectPreferences) return tokens;
  const disabledPreferences = await database.select({ userId: notificationPreferences.userId }).from(notificationPreferences).where(and(inArray(notificationPreferences.userId, userIds), eq(notificationPreferences.category, category), eq(notificationPreferences.enabled, false)));
  const disabled = new Set(disabledPreferences.map((item) => item.userId));
  return tokens.filter((item) => !disabled.has(item.userId));
}

/** Apaga tokens antigos da mesma instalação do app (identificada por "fcm:<id>" ou "expo:<id>"), mantendo o atual. */
export async function deleteOtherDeviceTokens(installId: string, keepToken: string) {
  const database = await getDb();
  if (!database) return;
  await database.delete(notificationTokens).where(and(inArray(notificationTokens.platform, [`fcm:${installId}`, `expo:${installId}`]), ne(notificationTokens.token, keepToken)));
}

export async function deleteNotificationTokens(tokens: string[]) {
  const database = await getDb();
  if (!database || tokens.length === 0) return;
  await database.delete(notificationTokens).where(inArray(notificationTokens.token, tokens));
}

export async function createAppNotification(data: typeof appNotifications.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const result = await database.insert(appNotifications).values({ ...data, encryptedData: sealFields({ title: data.title, body: data.body, data: data.data }) });
  return getInsertId(result);
}

export async function createAppNotifications(userIds: number[], data: Omit<typeof appNotifications.$inferInsert, "userId">) {
  const database = await getDb();
  if (!database || userIds.length === 0) return;
  await database.insert(appNotifications).values(userIds.map((userId) => ({ ...data, userId, encryptedData: sealFields({ title: data.title, body: data.body, data: data.data }) })));
}

export async function getClientOperation(userId: number, operationId: string) {
  const database = await getDb();
  if (!database) return undefined;
  const rows = await database.select({ operation: clientOperations.operation, result: clientOperations.result })
    .from(clientOperations)
    .where(and(eq(clientOperations.userId, userId), eq(clientOperations.operationId, operationId)))
    .limit(1);
  return rows[0];
}

export async function saveClientOperation(data: typeof clientOperations.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const existing = await getClientOperation(data.userId, data.operationId);
  if (existing) return existing;
  try {
    await database.insert(clientOperations).values({ ...data, operationId: data.operationId.slice(0, 128), operation: data.operation.slice(0, 64) });
  } catch (error) {
    const concurrent = await getClientOperation(data.userId, data.operationId);
    if (concurrent) return concurrent;
    throw error;
  }
  return { operation: data.operation, result: data.result };
}

export async function listAppNotifications(userId: number, limit = 100) {
  const database = await getDb();
  if (!database) return [];
  const rows = await database.select().from(appNotifications)
    .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.trashedAt)))
    .orderBy(desc(appNotifications.createdAt)).limit(limit);
  return rows.map((row) => decryptFields(row)).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function listTrashedAppNotifications(userId: number, limit = 100) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(appNotifications)
    .where(and(eq(appNotifications.userId, userId), isNotNull(appNotifications.trashedAt)))
    .orderBy(desc(appNotifications.trashedAt), desc(appNotifications.createdAt)).limit(limit);
}

export async function getWeeklyNotificationSummary(userId: number) {
  const database = await getDb();
  const empty = { total: 0, unread: 0, byCategory: { announcements: 0, requests: 0, suggestions: 0, account: 0 }, since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } as const;
  if (!database) return empty;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [totalRows, unreadRows, categoryRows] = await Promise.all([
    database.select({ value: count() }).from(appNotifications).where(and(eq(appNotifications.userId, userId), gt(appNotifications.createdAt, since), isNull(appNotifications.trashedAt))),
    database.select({ value: count() }).from(appNotifications).where(and(eq(appNotifications.userId, userId), gt(appNotifications.createdAt, since), isNull(appNotifications.trashedAt), isNull(appNotifications.readAt))),
    database.select({ type: appNotifications.type, value: count() }).from(appNotifications).where(and(eq(appNotifications.userId, userId), gt(appNotifications.createdAt, since), isNull(appNotifications.trashedAt))).groupBy(appNotifications.type),
  ]);
  const byCategory = { ...empty.byCategory };
  for (const row of categoryRows) {
    const category = row.type.includes("announcement") ? "announcements" : row.type.includes("request") ? "requests" : row.type.includes("suggestion") ? "suggestions" : "account";
    byCategory[category] += Number(row.value ?? 0);
  }
  return { total: Number(totalRows[0]?.value ?? 0), unread: Number(unreadRows[0]?.value ?? 0), byCategory, since };
}

export async function countUnreadAppNotifications(userId: number) {
  const database = await getDb();
  if (!database) return 0;
  const result = await database.select({ value: count() }).from(appNotifications)
    .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt), isNull(appNotifications.trashedAt)));
  return Number(result[0]?.value ?? 0);
}

export async function markAppNotificationRead(userId: number, id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(appNotifications).set({ readAt: new Date() })
    .where(and(eq(appNotifications.id, id), eq(appNotifications.userId, userId), isNull(appNotifications.trashedAt)));
}

export async function markAllAppNotificationsRead(userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(appNotifications).set({ readAt: new Date() })
    .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt), isNull(appNotifications.trashedAt)));
}

export async function moveAppNotificationToTrash(userId: number, id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(appNotifications).set({ trashedAt: new Date() })
    .where(and(eq(appNotifications.id, id), eq(appNotifications.userId, userId), isNull(appNotifications.trashedAt)));
  return { success: true } as const;
}

export async function moveAppNotificationsToTrash(userId: number, ids: number[]) {
  const database = await getDb();
  if (!database || ids.length === 0) return { success: true } as const;
  await database.update(appNotifications).set({ trashedAt: new Date() })
    .where(and(eq(appNotifications.userId, userId), inArray(appNotifications.id, ids), isNull(appNotifications.trashedAt)));
  return { success: true } as const;
}

export async function restoreAppNotification(userId: number, id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(appNotifications).set({ trashedAt: null })
    .where(and(eq(appNotifications.id, id), eq(appNotifications.userId, userId), isNotNull(appNotifications.trashedAt)));
  return { success: true } as const;
}

export async function restoreAppNotifications(userId: number, ids: number[]) {
  const database = await getDb();
  if (!database || ids.length === 0) return { success: true } as const;
  await database.update(appNotifications).set({ trashedAt: null })
    .where(and(eq(appNotifications.userId, userId), inArray(appNotifications.id, ids), isNotNull(appNotifications.trashedAt)));
  return { success: true } as const;
}

export async function permanentlyDeleteAppNotification(userId: number, id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.delete(appNotifications).where(and(eq(appNotifications.id, id), eq(appNotifications.userId, userId), isNotNull(appNotifications.trashedAt)));
  return { success: true } as const;
}

export async function permanentlyDeleteAppNotifications(userId: number, ids: number[]) {
  const database = await getDb();
  if (!database || ids.length === 0) return { success: true } as const;
  await database.delete(appNotifications).where(and(eq(appNotifications.userId, userId), inArray(appNotifications.id, ids), isNotNull(appNotifications.trashedAt)));
  return { success: true } as const;
}

// Mantém compatibilidade com versões anteriores: apagar agora significa mover para a lixeira.
export const deleteAppNotification = moveAppNotificationToTrash;
export const deleteAppNotifications = moveAppNotificationsToTrash;
export async function listNotificationPreferences(userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select({ category: notificationPreferences.category, enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
}
export async function upsertNotificationPreference(userId: number, category: string, enabled: boolean) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const current = await database.select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.category, category)))
    .limit(1);
  if (current[0]) {
    await database.update(notificationPreferences).set({ enabled }).where(eq(notificationPreferences.id, current[0].id));
  } else {
    await database.insert(notificationPreferences).values({ userId, category, enabled });
  }
  return { category, enabled } as const;
}

export async function createSuggestion(data: typeof suggestions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(suggestions).values({ ...data, encryptedData: sealFields({ neighborhood: data.neighborhood, title: data.title, description: data.description, photoUrl: data.photoUrl }) });
  return getInsertId(result);
}

export async function updateSuggestion(id: number, data: { title: string; description: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await db.select().from(suggestions).where(eq(suggestions.id, id)).limit(1);
  const existing = current[0];
  await db.update(suggestions).set({ ...data, encryptedData: sealFields({ neighborhood: existing?.neighborhood, title: data.title, description: data.description, photoUrl: existing?.photoUrl }) }).where(eq(suggestions.id, id));
}

export async function getSuggestionOwnerId(id: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select({ userId: suggestions.userId }).from(suggestions).where(eq(suggestions.id, id)).limit(1);
  return result[0]?.userId;
}

export async function updateOwnSuggestion(userId: number, id: number, data: { title: string; description: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await db.select().from(suggestions).where(and(eq(suggestions.id, id), eq(suggestions.userId, userId))).limit(1);
  const existing = current[0];
  await db.update(suggestions).set({ ...data, encryptedData: sealFields({ neighborhood: existing?.neighborhood, title: data.title, description: data.description, photoUrl: existing?.photoUrl }) }).where(and(eq(suggestions.id, id), eq(suggestions.userId, userId)));
  const updated = await db.select().from(suggestions).where(and(eq(suggestions.id, id), eq(suggestions.userId, userId))).limit(1);
  return updated.map((row) => decryptFields(row)).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function deleteSuggestion(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(suggestions).where(eq(suggestions.id, id));
}

export async function listUserSuggestions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(suggestions).where(eq(suggestions.userId, userId)).orderBy(desc(suggestions.createdAt));
  return rows.map((row) => decryptFields(row)).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function listAnnouncements(userId?: number, role?: "user" | "admin", residentNeighborhood?: string | null) {
  const db = await getDb();
  if (!db) return [];
  const items = await db.select({
    id: announcements.id,
    adminId: announcements.adminId,
    adminName: users.name,
    title: announcements.title,
    content: announcements.content,
    category: announcements.category,
    audience: announcements.audience,
    neighborhood: announcements.neighborhood,
    publishedAt: announcements.publishedAt,
    updatedAt: announcements.updatedAt,
  }).from(announcements).leftJoin(users, eq(announcements.adminId, users.id)).orderBy(desc(announcements.publishedAt));
  const residentKey = normalizeName(residentNeighborhood);
  const visibleItems = items.filter((item) => {
    // O painel administrativo precisa auditar e gerenciar todos os comunicados,
    // inclusive os direcionados somente a moradores ou a um bairro específico.
    // O filtro de público/bairro continua sendo aplicado apenas ao morador.
    const audienceAllowed = role === "admin" || item.audience === "all" || !role || (role === "user" && item.audience === "residents");
    const targetKey = normalizeName(item.neighborhood);
    // Sem bairro = comunicado de toda a cidade. Com bairro = apenas moradores daquele bairro.
    const neighborhoodAllowed = role === "admin" || !targetKey || targetKey === residentKey;
    return audienceAllowed && neighborhoodAllowed;
  });
  if (!visibleItems.length) return [];
  const likes = await db.select().from(announcementLikes).where(inArray(announcementLikes.announcementId, visibleItems.map((item) => item.id)));
  const counts = new Map<number, number>();
  const liked = new Set<number>();
  for (const like of likes) {
    counts.set(like.announcementId, (counts.get(like.announcementId) ?? 0) + 1);
    if (userId !== undefined && like.userId === userId) liked.add(like.announcementId);
  }
  return visibleItems.map((item) => ({ ...item, likeCount: counts.get(item.id) ?? 0, likedByMe: liked.has(item.id) }));
}

export async function listAnnouncementLikeUsers(announcementId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const announcement = await db.select({ id: announcements.id }).from(announcements).where(eq(announcements.id, announcementId)).limit(1);
  if (!announcement[0]) throw new Error("Comunicado não encontrado");
  const rows = await db.select({
    userId: announcementLikes.userId,
    name: users.name,
    username: residentCredentials.username,
    role: users.role,
    likedAt: announcementLikes.createdAt,
  }).from(announcementLikes)
    .innerJoin(users, eq(announcementLikes.userId, users.id))
    .leftJoin(residentCredentials, eq(announcementLikes.userId, residentCredentials.userId))
    .where(eq(announcementLikes.announcementId, announcementId));
  return rows
    .filter((row) => row.role === "user")
    .sort((a, b) => (a.name ?? a.username ?? "").localeCompare(b.name ?? b.username ?? "", "pt-BR"))
    .map((row) => ({
      userId: row.userId,
      name: row.name?.trim() || row.username || `Morador #${row.userId}`,
      likedAt: row.likedAt,
    }));
}

export async function toggleAnnouncementLike(announcementId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const announcement = await db.select({ id: announcements.id }).from(announcements).where(eq(announcements.id, announcementId)).limit(1);
  if (!announcement[0]) throw new Error("Comunicado não encontrado");
  const existing = await db.select({ id: announcementLikes.id }).from(announcementLikes).where(and(eq(announcementLikes.announcementId, announcementId), eq(announcementLikes.userId, userId))).limit(1);
  if (existing[0]) await db.delete(announcementLikes).where(eq(announcementLikes.id, existing[0].id));
  else await db.insert(announcementLikes).values({ announcementId, userId });
  const result = await db.select({ id: announcementLikes.id }).from(announcementLikes).where(eq(announcementLikes.announcementId, announcementId));
  return { liked: !existing[0], likeCount: result.length };
}

export async function updateAnnouncement(id: number, data: { title: string; content: string; category: typeof announcements.category.enumValues[number]; audience: typeof announcements.audience.enumValues[number]; neighborhood?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(announcements).set(data).where(eq(announcements.id, id));
}

export async function deleteAnnouncement(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(announcementLikes).where(eq(announcementLikes.announcementId, id));
  await db.delete(announcements).where(eq(announcements.id, id));
}

export async function createAnnouncement(data: typeof announcements.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(announcements).values(data);
  return getInsertId(result);
}

export async function createEmailDeliveryLog(data: typeof emailDeliveryLogs.$inferInsert) {
  const database = await getDb();
  if (!database) return null;
  try {
    const result = await database.insert(emailDeliveryLogs).values({
      ...data,
      errorCode: data.errorCode?.slice(0, 64) ?? null,
      errorMessage: data.errorMessage?.slice(0, 240) ?? null,
    });
    return getInsertId(result) || null;
  } catch (error) {
    console.warn("[Email] Failed to persist delivery log:", error);
    return null;
  }
}

export async function listEmailDeliveryLogs(limit = 100) {
  const database = await getDb();
  if (!database) return [];
  return database.select({
    id: emailDeliveryLogs.id,
    userId: emailDeliveryLogs.userId,
    purpose: emailDeliveryLogs.purpose,
    status: emailDeliveryLogs.status,
    provider: emailDeliveryLogs.provider,
    errorCode: emailDeliveryLogs.errorCode,
    errorMessage: emailDeliveryLogs.errorMessage,
    durationMs: emailDeliveryLogs.durationMs,
    createdAt: emailDeliveryLogs.createdAt,
  }).from(emailDeliveryLogs).orderBy(desc(emailDeliveryLogs.createdAt)).limit(Math.min(Math.max(limit, 1), 250));
}

export async function getEmailDeliverySummary() {
  const database = await getDb();
  if (!database) return { sent: 0, failed: 0, total: 0, lastAttemptAt: null as Date | null };
  const rows = await database.select({ status: emailDeliveryLogs.status, value: count() }).from(emailDeliveryLogs).groupBy(emailDeliveryLogs.status);
  const sent = Number(rows.find((row) => row.status === "sent")?.value ?? 0);
  const failed = Number(rows.find((row) => row.status === "failed")?.value ?? 0);
  const latest = await database.select({ createdAt: emailDeliveryLogs.createdAt }).from(emailDeliveryLogs).orderBy(desc(emailDeliveryLogs.createdAt)).limit(1);
  return { sent, failed, total: sent + failed, lastAttemptAt: latest[0]?.createdAt ?? null };
}

export async function createNetworkTelemetryEvent(data: typeof networkTelemetryEvents.$inferInsert) {
  const database = await getDb();
  if (!database) return null;
  try {
    const result = await database.insert(networkTelemetryEvents).values({
      ...data,
      endpoint: data.endpoint.slice(0, 240),
      method: data.method.slice(0, 12),
      errorCode: data.errorCode?.slice(0, 64) ?? null,
      message: data.message.slice(0, 240),
      durationMs: Math.max(0, Math.min(data.durationMs, 2_147_483_647)),
      platform: data.platform.slice(0, 16),
      appVersion: data.appVersion.slice(0, 32),
    });
    return getInsertId(result) || null;
  } catch (error) {
    console.warn("[Telemetry] Failed to persist network event:", error);
    return null;
  }
}

export async function listNetworkTelemetryEvents(limit = 100) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(networkTelemetryEvents)
    .orderBy(desc(networkTelemetryEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 250));
}

export async function createAdminAuditLog(data: typeof adminAuditLogs.$inferInsert) {
  const database = await getDb();
  if (!database) return null;
  try {
    const result = await database.insert(adminAuditLogs).values(data);
    return getInsertId(result) || null;
  } catch (error) {
    console.warn("[Audit] Failed to persist admin action:", error);
    return null;
  }
}

export async function deleteAdminAuditLog(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.delete(adminAuditLogs).where(eq(adminAuditLogs.id, id));
}

export async function deleteAdminAuditLogs(ids: number[]) {
  for (const id of ids) await deleteAdminAuditLog(id);
}

export async function listAdminAuditLogs(filters?: { targetUserId?: number; action?: string; limit?: number }) {
  const database = await getDb();
  if (!database) return [];
  const conditions = [];
  if (filters?.targetUserId) conditions.push(eq(adminAuditLogs.targetUserId, filters.targetUserId));
  if (filters?.action) conditions.push(eq(adminAuditLogs.action, filters.action));
  return database.select({
    id: adminAuditLogs.id,
    adminId: adminAuditLogs.adminId,
    adminName: users.name,
    action: adminAuditLogs.action,
    targetType: adminAuditLogs.targetType,
    targetId: adminAuditLogs.targetId,
    targetUserId: adminAuditLogs.targetUserId,
    summary: adminAuditLogs.summary,
    metadata: adminAuditLogs.metadata,
    createdAt: adminAuditLogs.createdAt,
  }).from(adminAuditLogs)
    .leftJoin(users, eq(adminAuditLogs.adminId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(Math.min(Math.max(filters?.limit ?? 100, 1), 250));
}

export async function getAdminDashboardSummary(adminUserId: number, neighborhood?: string) {
  const database = await getDb();
  if (!database) return { pendingResidents: 0, openRequests: 0, unreadNotifications: 0, email: { sent: 0, failed: 0, total: 0, lastAttemptAt: null as Date | null } };
  const [pendingRows, openRows, unreadRows, email] = await Promise.all([
    neighborhood
      ? database.select({ value: count() }).from(users).innerJoin(residentCredentials, eq(users.id, residentCredentials.userId)).where(and(eq(users.role, "user"), eq(users.residentStatus, "pending"), eq(residentCredentials.neighborhood, neighborhood)))
      : database.select({ value: count() }).from(users).where(and(eq(users.role, "user"), eq(users.residentStatus, "pending"))),
    database.select({ value: count() }).from(requests).where(and(inArray(requests.status, ["received", "reviewing", "forwarded", "in_progress"]), neighborhood ? eq(requests.neighborhood, neighborhood) : undefined)),
    database.select({ value: count() }).from(appNotifications).where(and(eq(appNotifications.userId, adminUserId), isNull(appNotifications.readAt), isNull(appNotifications.trashedAt))),
    getEmailDeliverySummary(),
  ]);
  return {
    pendingResidents: Number(pendingRows[0]?.value ?? 0),
    openRequests: Number(openRows[0]?.value ?? 0),
    unreadNotifications: Number(unreadRows[0]?.value ?? 0),
    email,
  };
}

export async function listResidents(neighborhood?: string) {
  return listUsers(neighborhood);
}

export async function listUsers(neighborhood?: string) {
  const database = await getDb();
  if (!database) return [];
  return database.select({
    id: users.id,
    name: users.name,
    avatarUrl: users.avatarUrl,
    role: users.role,
    residentStatus: users.residentStatus,
    loginMethod: users.loginMethod,
    username: residentCredentials.username,
    address: residentCredentials.address,
    cep: residentCredentials.cep,
    street: residentCredentials.street,
    number: residentCredentials.number,
    neighborhood: residentCredentials.neighborhood,
    phone: residentCredentials.phone,
    sex: residentCredentials.sex,
    email: residentCredentials.email,
    complement: residentCredentials.complement,
    householdSize: residentCredentials.householdSize,
    emergencyContact: residentCredentials.emergencyContact,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).leftJoin(residentCredentials, eq(users.id, residentCredentials.userId)).where(neighborhood ? eq(residentCredentials.neighborhood, neighborhood) : undefined).orderBy(asc(users.name));
}

export async function updateResidentStatus(userId: number, residentStatus: typeof users.residentStatus.enumValues[number]) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const result = await database.update(users).set({ residentStatus }).where(and(eq(users.id, userId), eq(users.role, "user")));
  if (!result) throw new Error("Resident not found");
  return { userId, residentStatus };
}

export async function listWaterShortageRequests(neighborhood?: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(requests).where(and(eq(requests.category, "water_shortage"), neighborhood ? eq(requests.neighborhood, neighborhood) : undefined)).orderBy(desc(requests.createdAt));
}

export async function getResidentPasswordHash(userId: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select({ passwordHash: residentCredentials.passwordHash }).from(residentCredentials).where(eq(residentCredentials.userId, userId)).limit(1);
  return result[0]?.passwordHash;
}

export async function createPasswordChangeChallenge(data: typeof passwordChangeChallenges.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const result = await database.insert(passwordChangeChallenges).values(data);
  return getInsertId(result);
}

export async function getLatestPasswordChangeChallenge(userId: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(passwordChangeChallenges).where(and(eq(passwordChangeChallenges.userId, userId), isNull(passwordChangeChallenges.usedAt))).orderBy(desc(passwordChangeChallenges.createdAt)).limit(1);
  return result[0];
}

export async function getPasswordChangeChallenge(userId: number, id: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(passwordChangeChallenges).where(and(eq(passwordChangeChallenges.userId, userId), eq(passwordChangeChallenges.id, id))).limit(1);
  return result[0];
}

export async function confirmPasswordChangeChallenge(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(passwordChangeChallenges).set({ confirmedAt: new Date() }).where(and(eq(passwordChangeChallenges.id, id), isNull(passwordChangeChallenges.confirmedAt), isNull(passwordChangeChallenges.usedAt)));
}

export async function incrementPasswordChangeChallengeAttempts(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const current = await database.select({ attempts: passwordChangeChallenges.attempts }).from(passwordChangeChallenges).where(eq(passwordChangeChallenges.id, id)).limit(1);
  if (current[0]) await database.update(passwordChangeChallenges).set({ attempts: current[0].attempts + 1 }).where(eq(passwordChangeChallenges.id, id));
}

export async function consumePasswordChangeChallenge(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(passwordChangeChallenges).set({ usedAt: new Date() }).where(and(eq(passwordChangeChallenges.id, id), isNull(passwordChangeChallenges.usedAt)));
}

export async function updateResidentPassword(userId: number, passwordHash: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(residentCredentials).set({ passwordHash }).where(eq(residentCredentials.userId, userId));
}

export async function createPasswordResetCode(data: typeof passwordResetCodes.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const result = await database.insert(passwordResetCodes).values(data);
  return getInsertId(result);
}

export async function getLatestPasswordResetCode(userId: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(passwordResetCodes).where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt))).orderBy(desc(passwordResetCodes.createdAt)).limit(1);
  return result[0];
}

export async function incrementPasswordResetAttempts(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const current = await database.select({ attempts: passwordResetCodes.attempts }).from(passwordResetCodes).where(eq(passwordResetCodes.id, id)).limit(1);
  if (current[0]) await database.update(passwordResetCodes).set({ attempts: current[0].attempts + 1 }).where(eq(passwordResetCodes.id, id));
}

export async function consumePasswordResetCode(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(passwordResetCodes).set({ usedAt: new Date() }).where(and(eq(passwordResetCodes.id, id), isNull(passwordResetCodes.usedAt)));
}

export async function getResidentCredentialByUserId(userId: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(residentCredentials).where(eq(residentCredentials.userId, userId)).limit(1);
  return decryptFields(result[0]);
}

export async function updateResidentProfile(userId: number, data: { name: string; address: string; cep?: string | null; street?: string | null; number?: string | null; neighborhood?: string | null; phone: string; sex: typeof residentCredentials.sex.enumValues[number]; email?: string | null; complement?: string | null; householdSize?: number | null; emergencyContact?: string | null }) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  // O aplicativo só precisa confirmar a conclusão. Evitamos uma terceira
  // consulta de leitura no fim da mutation, que deixava a resposta mais
  // vulnerável a atrasos da conexão móvel.
  await database.update(users).set({ name: data.name, encryptedData: sealFields({ name: data.name }) }).where(eq(users.id, userId));
  await database.update(residentCredentials).set({ address: data.address, cep: data.cep ?? null, street: data.street ?? null, number: data.number ?? null, neighborhood: data.neighborhood ?? null, phone: data.phone, sex: data.sex, email: data.email ?? null, complement: data.complement ?? null, householdSize: data.householdSize ?? null, emergencyContact: data.emergencyContact ?? null, encryptedData: sealFields({ address: data.address, cep: data.cep, street: data.street, number: data.number, neighborhood: data.neighborhood, phone: data.phone, email: data.email, complement: data.complement, emergencyContact: data.emergencyContact }) }).where(eq(residentCredentials.userId, userId));
  return { success: true } as const;
}

export async function deleteResident(userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const residentRequests = await database.select({ id: requests.id }).from(requests).where(eq(requests.userId, userId));
  if (residentRequests.length) await database.delete(requestUpdates).where(inArray(requestUpdates.requestId, residentRequests.map(({ id }) => id)));
  await database.delete(appNotifications).where(eq(appNotifications.userId, userId));
  await database.delete(requests).where(eq(requests.userId, userId));
  await database.delete(suggestions).where(eq(suggestions.userId, userId));
  // Dados ligados ao morador que antes ficavam órfãos no banco (curtidas, sessões, tokens de push, códigos…).
  await database.delete(announcementLikes).where(eq(announcementLikes.userId, userId));
  await database.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  await database.delete(notificationTokens).where(eq(notificationTokens.userId, userId));
  await database.delete(authSessions).where(eq(authSessions.userId, userId));
  await database.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, userId));
  await database.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, userId));
  await database.delete(passwordChangeChallenges).where(eq(passwordChangeChallenges.userId, userId));
  await database.delete(clientOperations).where(eq(clientOperations.userId, userId));
  await database.delete(networkTelemetryEvents).where(eq(networkTelemetryEvents.userId, userId));
  await database.delete(residentCredentials).where(eq(residentCredentials.userId, userId));
  await database.delete(users).where(and(eq(users.id, userId), eq(users.role, "user")));
}

export async function getSocialLinks() {
  const database = await getDb();
  if (!database) return { instagram: null, facebook: null, whatsapp: null, youtube: null, website: null };
  const result = await database.select().from(socialLinks).orderBy(desc(socialLinks.id)).limit(1);
  return result[0] ?? { instagram: null, facebook: null, whatsapp: null, youtube: null, website: null };
}

export async function updateSocialLinks(data: { instagram?: string | null; facebook?: string | null; whatsapp?: string | null; youtube?: string | null; website?: string | null }) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const existing = await database.select({ id: socialLinks.id }).from(socialLinks).orderBy(desc(socialLinks.id)).limit(1);
  if (existing[0]) await database.update(socialLinks).set({ ...data, updatedAt: new Date() }).where(eq(socialLinks.id, existing[0].id));
  else await database.insert(socialLinks).values({ instagram: data.instagram ?? null, facebook: data.facebook ?? null, whatsapp: data.whatsapp ?? null, youtube: data.youtube ?? null, website: data.website ?? null });
  return getSocialLinks();
}

export async function getResidentCredentialByUsername(username: string) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(residentCredentials).where(eq(residentCredentials.username, username)).limit(1);
  return decryptFields(result[0]);
}

export async function getResidentCredentialByEmail(email: string) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(residentCredentials).where(eq(residentCredentials.email, email)).limit(1);
  return decryptFields(result[0]);
}

export async function createResidentCredential(data: typeof residentCredentials.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.insert(residentCredentials).values({ ...data, encryptedData: sealFields({ address: data.address, cep: data.cep, street: data.street, number: data.number, neighborhood: data.neighborhood, phone: data.phone, email: data.email, complement: data.complement, emergencyContact: data.emergencyContact }) });
}

export async function createEmailVerificationCode(data: typeof emailVerificationCodes.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(emailVerificationCodes).set({ usedAt: new Date() }).where(and(eq(emailVerificationCodes.userId, data.userId), isNull(emailVerificationCodes.usedAt)));
  const result = await database.insert(emailVerificationCodes).values({ ...data, encryptedData: sealFields({ email: data.email }) });
  return getInsertId(result);
}

export async function getLatestEmailVerificationCode(userId: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(emailVerificationCodes).where(and(eq(emailVerificationCodes.userId, userId), isNull(emailVerificationCodes.usedAt))).orderBy(desc(emailVerificationCodes.createdAt)).limit(1);
  return result[0];
}

export async function incrementEmailVerificationAttempts(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const current = await database.select({ attempts: emailVerificationCodes.attempts }).from(emailVerificationCodes).where(eq(emailVerificationCodes.id, id)).limit(1);
  if (current[0]) await database.update(emailVerificationCodes).set({ attempts: current[0].attempts + 1 }).where(and(eq(emailVerificationCodes.id, id), isNull(emailVerificationCodes.usedAt)));
}

export async function consumeEmailVerificationCode(id: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(emailVerificationCodes).set({ usedAt: new Date() }).where(and(eq(emailVerificationCodes.id, id), isNull(emailVerificationCodes.usedAt)));
}

export async function markResidentEmailVerified(userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(residentCredentials).set({ emailVerifiedAt: new Date() }).where(eq(residentCredentials.userId, userId));
}

export { residentCredentials, emailVerificationCodes };

export async function createAuthSession(data: typeof authSessions.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.insert(authSessions).values(data);
}

export async function listAuthSessions(userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select({ id: authSessions.id, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt, createdAt: authSessions.createdAt }).from(authSessions).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt))).orderBy(desc(authSessions.lastSeenAt));
}

export async function touchAuthSession(tokenHash: string) {
  const database = await getDb();
  if (!database) return;
  await database.update(authSessions).set({ lastSeenAt: new Date() }).where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
}

export async function revokeAuthSession(userId: number, sessionId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
}

export async function revokeAllAuthSessions(userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  await database.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
}

export async function getAuthSessionState(tokenHash: string) {
  const database = await getDb();
  if (!database) return { databaseAvailable: false as const, session: null };
  const result = await database.select({ id: authSessions.id, userId: authSessions.userId, tokenHash: authSessions.tokenHash, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt }).from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).limit(1);
  return { databaseAvailable: true as const, session: result[0] ?? null };
}

export async function isAuthSessionActive(tokenHash: string) {
  const state = await getAuthSessionState(tokenHash);
  if (!state.databaseAvailable) return true;
  return Boolean(state.session && !state.session.revokedAt && state.session.expiresAt.getTime() > Date.now());
}

export async function createBackupSnapshot(data: typeof backupSnapshots.$inferInsert) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const result = await database.insert(backupSnapshots).values(data);
  return getInsertId(result);
}

export async function listBackupSnapshots() {
  const database = await getDb();
  if (!database) return [];
  return database.select({ id: backupSnapshots.id, createdBy: backupSnapshots.createdBy, label: backupSnapshots.label, checksum: backupSnapshots.checksum, createdAt: backupSnapshots.createdAt }).from(backupSnapshots).orderBy(desc(backupSnapshots.createdAt));
}

export async function getBackupSnapshot(id: number) {
  const database = await getDb();
  if (!database) return undefined;
  const result = await database.select().from(backupSnapshots).where(eq(backupSnapshots.id, id)).limit(1);
  return result[0];
}

export async function exportBackupData() {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const [userRows, credentialRows, requestRows, requestUpdateRows, suggestionRows, socialRows, announcementRows, likeRows, notificationRows, preferenceRows, auditRows] = await Promise.all([
    database.select().from(users), database.select().from(residentCredentials), database.select().from(requests), database.select().from(requestUpdates), database.select().from(suggestions), database.select().from(socialLinks), database.select().from(announcements), database.select().from(announcementLikes), database.select().from(appNotifications), database.select().from(notificationPreferences), database.select().from(adminAuditLogs),
  ]);
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), tables: { users: userRows, residentCredentials: credentialRows, requests: requestRows, requestUpdates: requestUpdateRows, suggestions: suggestionRows, socialLinks: socialRows, announcements: announcementRows, announcementLikes: likeRows, appNotifications: notificationRows, notificationPreferences: preferenceRows, adminAuditLogs: auditRows } };
}

/** O backup é guardado como JSON: as datas voltam como texto ISO e precisam virar Date antes de ir ao banco. */
function reviveDates<T>(rows: T[]): T[] {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  return rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, typeof value === "string" && iso.test(value) ? new Date(value) : value])) as T);
}

export async function restoreBackupData(payload: ReturnType<typeof exportBackupData> extends Promise<infer T> ? T : never) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const t = payload.tables;
  await database.transaction(async (tx) => {
    await tx.delete(announcementLikes); await tx.delete(appNotifications); await tx.delete(notificationPreferences); await tx.delete(requestUpdates); await tx.delete(requests); await tx.delete(suggestions); await tx.delete(announcements); await tx.delete(adminAuditLogs); await tx.delete(residentCredentials); await tx.delete(users); await tx.delete(socialLinks);
    if (t.users.length) await tx.insert(users).values(reviveDates(t.users));
    if (t.residentCredentials.length) await tx.insert(residentCredentials).values(reviveDates(t.residentCredentials));
    if (t.requests.length) await tx.insert(requests).values(reviveDates(t.requests));
    if (t.requestUpdates.length) await tx.insert(requestUpdates).values(reviveDates(t.requestUpdates));
    if (t.suggestions.length) await tx.insert(suggestions).values(reviveDates(t.suggestions));
    if (t.socialLinks.length) await tx.insert(socialLinks).values(reviveDates(t.socialLinks));
    if (t.announcements.length) await tx.insert(announcements).values(reviveDates(t.announcements));
    if (t.announcementLikes.length) await tx.insert(announcementLikes).values(reviveDates(t.announcementLikes));
    if (t.appNotifications.length) await tx.insert(appNotifications).values(reviveDates(t.appNotifications));
    if (t.notificationPreferences.length) await tx.insert(notificationPreferences).values(reviveDates(t.notificationPreferences));
    if (t.adminAuditLogs.length) await tx.insert(adminAuditLogs).values(reviveDates(t.adminAuditLogs));
  });
}


/** Contas com papel de administrador (para a limpeza de duplicadas). */
export async function listAdminAccounts() {
  const database = await getDb();
  if (!database) return [];
  const rows = await database.select({ id: users.id, openId: users.openId, name: users.name, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.id));
  return rows;
}

/** Apaga TODAS as contas administrativas, menos a indicada, com sessões, tokens e vínculos. */
export async function deleteAdminAccountsExcept(keepUserId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const extras = (await database.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), ne(users.id, keepUserId)))).map((row) => row.id);
  for (const userId of extras) {
    await database.delete(appNotifications).where(eq(appNotifications.userId, userId));
    await database.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    await database.delete(notificationTokens).where(eq(notificationTokens.userId, userId));
    await database.delete(authSessions).where(eq(authSessions.userId, userId));
    await database.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, userId));
    await database.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, userId));
    await database.delete(passwordChangeChallenges).where(eq(passwordChangeChallenges.userId, userId));
    await database.delete(clientOperations).where(eq(clientOperations.userId, userId));
    await database.delete(networkTelemetryEvents).where(eq(networkTelemetryEvents.userId, userId));
    await database.delete(residentCredentials).where(eq(residentCredentials.userId, userId));
    await database.delete(users).where(and(eq(users.id, userId), eq(users.role, "admin")));
  }
  return extras.length;
}

/**
 * Senha da gestão alterada dentro do app. Fica guardada (somente o hash) numa linha de resident_credentials
 * ligada à conta administrativa — não exige mudança no esquema do banco.
 * Enquanto não existir, vale ADMIN_PASSWORD do servidor.
 */
export async function setAdminPasswordHash(userId: number, username: string, passwordHash: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const existing = await database.select({ id: residentCredentials.id }).from(residentCredentials).where(eq(residentCredentials.userId, userId)).limit(1);
  if (existing[0]) await database.update(residentCredentials).set({ passwordHash }).where(eq(residentCredentials.userId, userId));
  else await createResidentCredential({ userId, username: `admin:${username}`.slice(0, 64), passwordHash, phone: "-", sex: "prefer_not_to_say" });
}

export async function clearAdminPasswordOverride(userId: number) {
  const database = await getDb();
  if (!database) return;
  await database.delete(residentCredentials).where(eq(residentCredentials.userId, userId));
}
