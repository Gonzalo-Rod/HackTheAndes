import { z } from "zod";

const nonempty = z.string().min(1);
const managementSchema = z.object({
  SUPABASE_ACCESS_TOKEN: nonempty,
  SUPABASE_PROJECT_REF: z.string().regex(/^[a-z0-9]{20}$/),
});
const databaseSchema = z
  .object({
    DATABASE_URL: z
      .url()
      .refine(
        (value) =>
          URL.canParse(value) && ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      ),
    DATABASE_SSL_MODE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(["verify-full", "disable"]).default("verify-full"),
    ),
  })
  .superRefine((value, context) => {
    if (!URL.canParse(value.DATABASE_URL)) return;
    const url = new URL(value.DATABASE_URL);
    if (url.search)
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Configure TLS separately from connection URL parameters",
      });
    if (
      value.DATABASE_SSL_MODE === "disable" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_SSL_MODE"],
        message: "TLS may only be disabled on loopback test databases",
      });
    }
  });
const apiSchema = z.object({
  SUPABASE_URL: z
    .url()
    .refine((value) => URL.canParse(value) && new URL(value).protocol === "https:"),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_"),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
});

export function parseConfiguration<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const names = [
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "configuration"))),
    ];
    throw new Error(`Invalid or missing configuration: ${names.join(", ")}`);
  }
  return parsed.data;
}
export function parseDatabaseConfiguration(input: unknown) {
  return parseConfiguration(databaseSchema, input);
}
export function loadDatabaseConfiguration() {
  return parseDatabaseConfiguration(process.env);
}
export function loadManagementConfiguration() {
  return parseConfiguration(managementSchema, process.env);
}
export function loadApiConfiguration() {
  return parseConfiguration(apiSchema, process.env);
}
export function loadOptionalDatabaseConfiguration() {
  return process.env.DATABASE_URL ? loadDatabaseConfiguration() : null;
}
const jobSchema = z.object({
  ROAD_DATA_JOB_SECRET: z
    .string()
    .min(32)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export function parseJobConfiguration(input: unknown) {
  return parseConfiguration(jobSchema, input);
}
export function loadJobConfiguration() {
  return parseJobConfiguration(process.env);
}
export type DatabaseConfiguration = z.infer<typeof databaseSchema>;
export type ManagementConfiguration = z.infer<typeof managementSchema>;

const roadContextSecretSchema = z.object({
  ROAD_DATA_API_SECRET: z
    .string()
    .min(32)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export function parseRoadContextSecret(input: unknown) {
  return parseConfiguration(roadContextSecretSchema, input);
}
export function loadRoadContextServerConfiguration() {
  return {
    ...loadDatabaseConfiguration(),
    ...parseConfiguration(roadContextServerSchema, process.env),
  };
}
// Reviewed versioned PE-22 geometry; test/historical imports must not become the live dataset.
const CURRENT_PE22_GEOMETRY_REVISION =
  "7cf50ab57642d874064bed07753c8783a705f9ae13cec6378c8bea1f72966c90";
const roadContextServerSchema = roadContextSecretSchema.extend({
  ROAD_DATA_GEOMETRY_REVISION: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .default(CURRENT_PE22_GEOMETRY_REVISION),
  ),
});
const roadContextClientSchema = roadContextSecretSchema.extend({
  ROAD_DATA_API_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
    );
  }),
});
export function loadRoadContextClientConfiguration() {
  return parseConfiguration(roadContextClientSchema, process.env);
}
export function parseRoadContextClientConfiguration(input: unknown) {
  return parseConfiguration(roadContextClientSchema, input);
}
