import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { mediaAssets } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const SAFE_KEY = /^(?:avatars|requests)\/\d+\/\d+-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

export async function storagePut(relKey: string, data: Buffer | Uint8Array, contentType = "image/jpeg"): Promise<{ key: string; url: string }> {
  const ext = ALLOWED[contentType];
  if (!ext) throw new Error("Formato de imagem não permitido. Use JPEG, PNG ou WebP.");
  if (data.byteLength > MAX_IMAGE_BYTES) throw new Error("A imagem excede 3 MB. Escolha uma imagem menor.");

  const [category, userId] = relKey.replace(/\\/g, "/").split("/");
  if (!category || !["avatars", "requests"].includes(category) || !/^\d+$/.test(userId ?? "")) {
    throw new Error("Destino de mídia inválido.");
  }

  const key = `${category}/${userId}/${Date.now()}-${randomUUID()}.${ext}`;
  const db = await getDb();
  if (!db) throw new Error("O banco de dados não está disponível para salvar a imagem.");

  await db.insert(mediaAssets).values({ assetKey: key, contentType, data: Buffer.from(data) });
  const url = ENV.publicUrl ? `${ENV.publicUrl}/media/${key}` : `/media/${key}`;
  return { key, url };
}

export async function storageGet(key: string): Promise<{ contentType: string; data: Buffer } | null> {
  if (!SAFE_KEY.test(key)) return null;
  const db = await getDb();
  if (!db) return null;

  const [asset] = await db
    .select({ contentType: mediaAssets.contentType, data: mediaAssets.data })
    .from(mediaAssets)
    .where(eq(mediaAssets.assetKey, key))
    .limit(1);

  return asset ? { contentType: asset.contentType, data: Buffer.from(asset.data) } : null;
}
