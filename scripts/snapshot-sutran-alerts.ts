// Captures SUTRAN's current alerts into src/integrations/sutran/alerts-snapshot.json, the
// labeled last-resort fallback served when SUTRAN is down and no cached response exists.
// Run before a demo or deploy: npm run data:snapshot

import fs from "node:fs/promises";
import path from "node:path";

import { createSutranClient } from "../src/integrations/sutran/sutran-client";

const SUTRAN_API = process.env.SUTRAN_API_BASE || "https://api.sigea.sutran.gob.pe/public";
const OUT_FILE = path.resolve(import.meta.dirname, "..", "src", "integrations", "sutran", "alerts-snapshot.json");

async function main() {
  const client = createSutranClient({ baseUrl: SUTRAN_API });
  const { records, invalidCount } = await client.listAlerts({ requestId: "snapshot-script" });
  const snapshot = { capturedAt: new Date().toISOString(), source: client.endpoint, records };
  await fs.writeFile(OUT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Saved ${records.length} alerts (${invalidCount} invalid skipped) to ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((error: unknown) => {
  console.error(`Snapshot failed; the previous file was kept. ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
