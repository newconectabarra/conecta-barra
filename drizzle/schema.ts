import { boolean, customType, int, longtext, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

const longblob = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "longblob" });

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatarUrl"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  residentStatus: mysqlEnum("residentStatus", ["pending", "approved", "blocked"]).default("approved").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const residentCredentials = mysqlTable("resident_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  address: text("address"),
  cep: varchar("cep", { length: 9 }),
  street: varchar("street", { length: 255 }),
  number: varchar("number", { length: 20 }),
  neighborhood: varchar("neighborhood", { length: 120 }),
  city: varchar("city", { length: 120 }).default("Barra do Piraí"),
  state: varchar("state", { length: 2 }).default("RJ"),
  phone: varchar("phone", { length: 32 }).notNull(),
  sex: mysqlEnum("sex", ["female", "male", "non_binary", "prefer_not_to_say"]).notNull(),
  email: varchar("email", { length: 320 }),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  complement: varchar("complement", { length: 255 }),
  householdSize: int("householdSize"),
  emergencyContact: varchar("emergencyContact", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const emailVerificationCodes = mysqlTable("email_verification_codes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("codeHash", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attempts: int("attempts").default(0).notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const notificationTokens = mysqlTable("notification_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  platform: varchar("platform", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const requests = mysqlTable("requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", ["lighting", "water_shortage", "water_leak", "sewage_leak", "mowing", "paving", "garbage", "drainage", "tree", "risk_area", "other"]).notNull(),
  description: text("description").notNull(),
  fullAddress: text("fullAddress").notNull(),
  cep: varchar("cep", { length: 9 }),
  neighborhood: varchar("neighborhood", { length: 120 }),
  referencePoint: text("referencePoint"),
  photoUrl: text("photoUrl"),
  status: mysqlEnum("status", ["received", "reviewing", "forwarded", "in_progress", "completed", "cancelled"]).default("received").notNull(),
  adminMessage: text("adminMessage"),
  waterAttendedAt: timestamp("waterAttendedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const requestUpdates = mysqlTable("request_updates", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  adminId: int("adminId").notNull(),
  status: mysqlEnum("status", ["received", "reviewing", "forwarded", "in_progress", "completed", "cancelled"]).notNull(),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const suggestions = mysqlTable("suggestions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  neighborhood: varchar("neighborhood", { length: 120 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  photoUrl: text("photoUrl"),
  status: mysqlEnum("status", ["received", "reviewing", "considered"]).default("received").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const neighborhoods = mysqlTable("neighborhoods", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  area: varchar("area", { length: 60 }).default("Sede").notNull(),
  active: boolean("active").default(true).notNull(),
  source: varchar("source", { length: 16 }).default("seed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const socialLinks = mysqlTable("social_links", {
  id: int("id").autoincrement().primaryKey(),
  instagram: text("instagram"),
  facebook: text("facebook"),
  whatsapp: text("whatsapp"),
  youtube: text("youtube"),
  website: text("website"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: mysqlEnum("category", ["event", "notice", "urgent", "general", "civil_defense"]).default("general").notNull(),
  audience: mysqlEnum("audience", ["all", "residents", "admins"]).default("all").notNull(),
  neighborhood: varchar("neighborhood", { length: 120 }),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const announcementLikes = mysqlTable("announcement_likes", {
  id: int("id").autoincrement().primaryKey(),
  announcementId: int("announcementId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const appNotifications = mysqlTable("app_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  data: text("data"),
  readAt: timestamp("readAt"),
  trashedAt: timestamp("trashedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const adminAuditLogs = mysqlTable("admin_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  targetType: varchar("targetType", { length: 64 }).notNull(),
  targetId: int("targetId"),
  targetUserId: int("targetUserId"),
  summary: varchar("summary", { length: 500 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const networkTelemetryEvents = mysqlTable("network_telemetry_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  endpoint: varchar("endpoint", { length: 240 }).notNull(),
  method: varchar("method", { length: 12 }).notNull(),
  status: int("status"),
  errorCode: varchar("errorCode", { length: 64 }),
  message: varchar("message", { length: 240 }).notNull(),
  durationMs: int("durationMs").notNull(),
  platform: varchar("platform", { length: 16 }).notNull(),
  appVersion: varchar("appVersion", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const emailDeliveryLogs = mysqlTable("email_delivery_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  purpose: varchar("purpose", { length: 64 }).notNull(),
  recipientHash: varchar("recipientHash", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["sent", "failed"]).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  errorCode: varchar("errorCode", { length: 64 }),
  errorMessage: varchar("errorMessage", { length: 240 }),
  durationMs: int("durationMs").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const clientOperations = mysqlTable("client_operations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  operationId: varchar("operationId", { length: 128 }).notNull(),
  operation: varchar("operation", { length: 64 }).notNull(),
  result: text("result").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  operationUnique: unique("client_operations_operation_unique").on(table.userId, table.operationId),
}));

export const authSessions = mysqlTable("auth_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  deviceLabel: varchar("deviceLabel", { length: 120 }).notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const passwordChangeChallenges = mysqlTable("password_change_challenges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  codeHash: varchar("codeHash", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attempts: int("attempts").default(0).notNull(),
  confirmedAt: timestamp("confirmedAt"),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const passwordResetCodes = mysqlTable("password_reset_codes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  codeHash: varchar("codeHash", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attempts: int("attempts").default(0).notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const backupSnapshots = mysqlTable("backup_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  createdBy: int("createdBy").notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  // LONGTEXT: o backup completo passa facilmente de 64 KB (limite do TEXT) e falhava com "Data too long".
  payload: longtext("payload").notNull(),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  encryptedData: text("encryptedData"),
});

export const mediaAssets = mysqlTable("media_assets", {
  assetKey: varchar("assetKey", { length: 255 }).primaryKey(),
  contentType: varchar("contentType", { length: 32 }).notNull(),
  data: longblob("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;
export type Suggestion = typeof suggestions.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NetworkTelemetryEvent = typeof networkTelemetryEvents.$inferSelect;
export type EmailDeliveryLog = typeof emailDeliveryLogs.$inferSelect;
export type ClientOperation = typeof clientOperations.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type BackupSnapshot = typeof backupSnapshots.$inferSelect;
export type PasswordChangeChallenge = typeof passwordChangeChallenges.$inferSelect;
export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;
export type AnnouncementLike = typeof announcementLikes.$inferSelect;

export type Neighborhood = typeof neighborhoods.$inferSelect;
