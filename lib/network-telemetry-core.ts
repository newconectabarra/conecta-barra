export type NetworkTelemetryEvent = {
  timestamp: string;
  endpoint: string;
  method: string;
  status?: number;
  errorCode?: string;
  message: string;
  durationMs: number;
  platform: string;
  appVersion: string;
  authenticated: boolean;
};

export function safeEndpoint(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search ? "?input=redacted" : ""}`.slice(0, 240);
  } catch {
    return value.replace(/https?:\/\/[^/]+/i, "").slice(0, 240) || "unknown";
  }
}

export function safeMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "Unknown network error");
  return message
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/token[=:]\s*[^\s,;]+/gi, "token=[redacted]")
    .replace(/password[=:]\s*[^\s,;]+/gi, "password=[redacted]")
    .slice(0, 240);
}
