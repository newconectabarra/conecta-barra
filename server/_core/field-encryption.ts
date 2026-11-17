import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

type EncryptedFieldMap = Record<string, string | null>;

function loadKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim() ?? "";
  if (!raw && process.env.NODE_ENV !== "production") return createHash("sha256").update("conecta-barra-local-field-encryption").digest();
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY não configurada. O servidor não pode ler ou gravar dados pessoais criptografados.");
  const key = raw.startsWith("base64:")
    ? Buffer.from(raw.slice("base64:".length), "base64")
    : /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) throw new Error("DATA_ENCRYPTION_KEY deve conter exatamente 32 bytes em hexadecimal ou base64.");
  return key;
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

/** Criptografa um único campo; cada chamada usa IV aleatório e autenticação GCM. */
export function encryptField(value: string | null | undefined): string | null {
  return seal(value);
}

/** Variante interna que mantém o IV explicitamente no formato persistido. */
export function seal(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, encode(iv), encode(cipher.getAuthTag()), encode(encrypted)].join(":");
}

export function open(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return value;
  const [, ivEncoded, tagEncoded, dataEncoded] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, loadKey(), decode(ivEncoded));
    decipher.setAuthTag(decode(tagEncoded));
    return Buffer.concat([decipher.update(decode(dataEncoded)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Falha de autenticação ao descriptografar um campo pessoal; verifique a chave DATA_ENCRYPTION_KEY.");
  }
}

export function sealFields(fields: Record<string, string | null | undefined>): string {
  const encrypted: EncryptedFieldMap = {};
  for (const [name, value] of Object.entries(fields)) encrypted[name] = seal(value);
  return JSON.stringify(encrypted);
}

export function openFields(payload: string | null | undefined): Record<string, string | null> {
  if (!payload) return {};
  const parsed = JSON.parse(payload) as EncryptedFieldMap;
  return Object.fromEntries(Object.entries(parsed).map(([name, value]) => [name, open(value)]));
}

/** Índice determinístico não reversível para buscas exatas sem expor o valor. */
export function blindIndex(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return createHmac("sha256", loadKey()).update(value.trim().toLocaleLowerCase("pt-BR")).digest("hex");
}

export function generateDataEncryptionKey() {
  return randomBytes(KEY_LENGTH).toString("hex");
}
