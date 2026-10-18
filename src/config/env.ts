import { z } from "zod";

// The only module that reads process.env. Validated once at startup; failures name the
// variable, never its value.

const EnvSchema = z.object({
  SUTRAN_API_BASE: z.url().default("https://api.sigea.sutran.gob.pe/public"),
  OPEN_METEO_BASE: z.url().default("https://api.open-meteo.com/v1"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse({
    SUTRAN_API_BASE: process.env.SUTRAN_API_BASE || undefined,
    OPEN_METEO_BASE: process.env.OPEN_METEO_BASE || undefined,
  });
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${names}. See .env.example.`);
  }
  return parsed.data;
}

export const env = loadEnv();

// Runtime-only credentials are validated before the corresponding service starts.
// Next.js builds and the public SUTRAN fallback do not require database credentials.
const PlatformEnvSchema = z.object({
  CONTACT_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  CONTACT_KEY_VERSION: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,32}$/)
    .default("v1"),
  PHONE_KEY_PEPPER: z.string().min(32),
  SESSION_SIGNING_SECRET: z.string().min(32),
  TEST_PHONE_KEYS: z
    .string()
    .default("")
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-f0-9]{64}$/))),
  TEAM_PHONE_KEYS: z
    .string()
    .default("")
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-f0-9]{64}$/))),
});
export type PlatformConfiguration = z.infer<typeof PlatformEnvSchema>;
export function loadPlatformConfiguration(): PlatformConfiguration {
  const result = PlatformEnvSchema.safeParse(process.env);
  if (!result.success)
    throw new Error(`Invalid platform configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  return result.data;
}
export { loadDatabaseConfiguration } from "@peruroad/road-data/database";
export function loadGeometryRevision(): string {
  return z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(process.env.ROAD_DATA_GEOMETRY_REVISION || "7cf50ab57642d874064bed07753c8783a705f9ae13cec6378c8bea1f72966c90");
}
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}
export function loadRealtimeConfiguration(): { url: string; publishableKey: string } | null {
  const result = z
    .object({ SUPABASE_URL: z.url(), SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_") })
    .safeParse(process.env);
  return result.success ? { url: result.data.SUPABASE_URL, publishableKey: result.data.SUPABASE_PUBLISHABLE_KEY } : null;
}

export function loadDemoSeedConfiguration(): { code: string } {
  const result = z.object({ DEMO_ACCESS_CODE: z.string().min(16).max(100) }).safeParse(process.env);
  if (!result.success) throw new Error("Invalid DEMO_ACCESS_CODE configuration");
  return { code: result.data.DEMO_ACCESS_CODE };
}

export interface ZavuConfiguration {
  apiKey: string;
  webhookSecret: string;
  senderId: string;
  publicAppUrl: string;
}
export function loadZavuConfiguration(): ZavuConfiguration {
  const result = z
    .object({
      ZAVU_API_KEY: z.string().min(1),
      ZAVU_WEBHOOK_SECRET: z.string().min(1),
      ZAVU_SENDER_ID: z.string().min(1),
      PUBLIC_APP_URL: z.url().startsWith("https://").default("https://peruroad-climate-git-feat-data-model-gozlie.vercel.app"),
    })
    .safeParse({ ...process.env, PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || undefined });
  if (!result.success)
    throw new Error(`Invalid Zavu configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  return {
    apiKey: result.data.ZAVU_API_KEY,
    webhookSecret: result.data.ZAVU_WEBHOOK_SECRET,
    senderId: result.data.ZAVU_SENDER_ID,
    publicAppUrl: new URL(result.data.PUBLIC_APP_URL).origin,
  };
}

export function loadOpenAiConfiguration(): { apiKey: string; model: string } | null {
  if (!process.env.OPENAI_API_KEY) return null;
  const result = z
    .object({ OPENAI_API_KEY: z.string().min(1), OPENAI_INTENT_MODEL: z.string().min(1).default("gpt-4.1-mini-2025-04-14") })
    .safeParse({ ...process.env, OPENAI_INTENT_MODEL: process.env.OPENAI_INTENT_MODEL || undefined });
  if (!result.success)
    throw new Error(`Invalid OpenAI configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  return { apiKey: result.data.OPENAI_API_KEY, model: result.data.OPENAI_INTENT_MODEL };
}

export function loadNotificationConfiguration() {
  const parsed = z
    .object({
      OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default("gpt-4o-mini-transcribe"),
      ZAVU_ALERT_TEMPLATE_ID: z.string().min(1).optional(),
      ROAD_DATA_JOB_SECRET: z.string().min(32),
    })
    .safeParse({
      ...process.env,
      OPENAI_TRANSCRIPTION_MODEL: process.env.OPENAI_TRANSCRIPTION_MODEL || undefined,
      ZAVU_ALERT_TEMPLATE_ID: process.env.ZAVU_ALERT_TEMPLATE_ID || undefined,
    });
  if (!parsed.success)
    throw new Error(`Invalid notification configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return {
    transcriptionModel: parsed.data.OPENAI_TRANSCRIPTION_MODEL,
    templateId: parsed.data.ZAVU_ALERT_TEMPLATE_ID ?? null,
    jobSecret: parsed.data.ROAD_DATA_JOB_SECRET,
  };
}

export function loadWeeklyReportConfiguration() {
  const parsed = z
    .object({ ZAVU_WEEKLY_REPORT_TEMPLATE_ID: z.string().min(1).optional() })
    .safeParse({ ZAVU_WEEKLY_REPORT_TEMPLATE_ID: process.env.ZAVU_WEEKLY_REPORT_TEMPLATE_ID || undefined });
  if (!parsed.success) throw new Error("Invalid ZAVU_WEEKLY_REPORT_TEMPLATE_ID configuration");
  return { templateId: parsed.data.ZAVU_WEEKLY_REPORT_TEMPLATE_ID ?? null };
}

const QatomConfigurationSchema = z.object({
  QATOM_MCP_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /^[a-z0-9-]+\.mcp\.m\.todaq\.net$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      ["/", "/mcp"].includes(url.pathname)
    );
  }),
  QATOM_CLIENT_ID: z.string().startsWith("agent_"),
  QATOM_CLIENT_SECRET: z.string().min(1),
  QATOM_CATALOG_ITEM_ID: z.coerce.number().int().positive(),
  QATOM_USD_TDN_DQ: z.string().min(1),
  QATOM_FULFILMENT_TOKEN: z.string().min(32),
  OPENAI_QATOM_MODEL: z.string().min(1).default("gpt-4.1-mini-2025-04-14"),
});
export function loadQatomConfiguration() {
  const parsed = QatomConfigurationSchema.safeParse({ ...process.env, OPENAI_QATOM_MODEL: process.env.OPENAI_QATOM_MODEL || undefined });
  if (!parsed.success) throw new Error(`Invalid Qatom configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return parsed.data;
}
export type QatomConfiguration = ReturnType<typeof loadQatomConfiguration>;
