import { z } from "zod";
import type { ManagementConfiguration } from "../../config/env.ts";
import { createFetchJsonTransport } from "../http/json-transport.ts";
import { postJson } from "../http/post-json.ts";

const poolerSchema = z.array(
  z.object({
    database_type: z.string(),
    db_host: z.string().endsWith(".pooler.supabase.com"),
    db_name: z.string(),
    db_port: z.number(),
  }),
);
const roleSchema = z.object({
  role: z.string().regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(1),
  ttl_seconds: z.number().positive(),
});
const keySchema = z.array(z.object({ type: z.string(), api_key: z.string().optional() }));

export function createSupabaseManagementClient(config: ManagementConfiguration) {
  const baseUrl = `https://api.supabase.com/v1/projects/${config.SUPABASE_PROJECT_REF}`;
  const options = {
    provider: "supabase-management",
    headers: { Authorization: `Bearer ${config.SUPABASE_ACCESS_TOKEN}` },
  };
  const transport = createFetchJsonTransport();
  return {
    async pooler() {
      const rows = poolerSchema.parse(
        await transport.getJson(`${baseUrl}/config/database/pooler`, options),
      );
      const primary = rows.find((row) => row.database_type === "PRIMARY");
      if (!primary) throw new Error("Primary Supabase pooler is unavailable");
      return primary;
    },
    async temporaryRole() {
      return roleSchema.parse(
        await postJson(`${baseUrl}/cli/login-role`, { read_only: false }, options),
      );
    },
    async apiKeys() {
      const keys = keySchema.parse(
        await transport.getJson(`${baseUrl}/api-keys?reveal=true`, options),
      );
      const publishable = keys.find((key) => key.type === "publishable")?.api_key;
      const secret = keys.find((key) => key.type === "secret")?.api_key;
      if (!publishable?.startsWith("sb_publishable_") || !secret?.startsWith("sb_secret_"))
        throw new Error("Project publishable/secret API keys are unavailable");
      return { publishable, secret };
    },
  };
}
