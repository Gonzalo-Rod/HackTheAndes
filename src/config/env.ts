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
