export type RetryableOperation<T> = () => Promise<T>;

const DEFAULT_RETRY_DELAYS_MS = [0, 700, 1600] as const;

export function createClientOperationId(prefix = "op") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isRetryableUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /network|conexão|conexao|timeout|demorou|fetch|servidor|temporariamente|storage|upload|5\d\d/i.test(message);
}

export async function withUploadRetries<T>(operation: RetryableOperation<T>, options?: { maxAttempts?: number; delaysMs?: readonly number[] }) {
  const delays = options?.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = Math.max(1, Math.min(options?.maxAttempts ?? delays.length, 4));
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableUploadError(error) || attempt === maxAttempts - 1) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível concluir o envio.");
}
