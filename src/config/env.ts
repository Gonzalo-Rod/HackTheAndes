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
}
export function loadZavuConfiguration(): ZavuConfiguration {
  const result = z
    .object({ ZAVU_API_KEY: z.string().min(1), ZAVU_WEBHOOK_SECRET: z.string().min(1), ZAVU_SENDER_ID: z.string().min(1) })
    .safeParse(process.env);
  if (!result.success)
    throw new Error(`Invalid Zavu configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  return { apiKey: result.data.ZAVU_API_KEY, webhookSecret: result.data.ZAVU_WEBHOOK_SECRET, senderId: result.data.ZAVU_SENDER_ID };
}
