// Structured JSON logs. Never pass phone numbers, tokens, keys or full provider payloads.

type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  operation: string;
  provider?: string;
  requestId?: string;
  durationMs?: number;
  result?: "ok" | "error" | "fallback" | "skipped";
  [key: string]: unknown;
}

function write(level: LogLevel, fields: LogFields): void {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (fields: LogFields) => write("info", fields),
  warn: (fields: LogFields) => write("warn", fields),
  error: (fields: LogFields) => write("error", fields),
};
