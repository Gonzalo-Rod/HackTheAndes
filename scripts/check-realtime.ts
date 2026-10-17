import { loadRealtimeConfiguration } from "../src/config/env";
import { database } from "../src/db/pool";
import { connectIncidentChanges } from "../src/integrations/realtime/incidents";

async function main() {
  const config = loadRealtimeConfiguration();
  if (!config) throw new Error("Configure Realtime first");
  const pool = database();
  let resolveConnected: (() => void) | undefined;
  let resolveChange: (() => void) | undefined;
  const connected = new Promise<void>((resolve) => {
    resolveConnected = resolve;
  });
  const changed = new Promise<void>((resolve) => {
    resolveChange = resolve;
  });
  const unsubscribe = connectIncidentChanges(
    config,
    () => resolveChange?.(),
    (state) => {
      console.log(JSON.stringify({ realtimeState: state }));
      if (state === "live") resolveConnected?.();
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Realtime verification timed out")), 20_000);
  });
  try {
    await Promise.race([connected, deadline]);
    const result = await pool.query(
      "update public.incidents set last_confirmed=last_confirmed where id='15456f66-1833-490e-a217-f1470d22d03e' and is_test",
    );
    if (result.rowCount !== 1) throw new Error("Run the explicit demo seed first");
    await Promise.race([changed, deadline]);
    console.log(
      JSON.stringify({
        state: "verified",
        transport: "Supabase Realtime",
        source: "demo incident trigger",
        browserOperationalTableAccess: "denied",
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        state: "realtime_check_failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
        fallback: "periodic sanitized API reads",
      }),
    );
    process.exitCode = 1;
  } finally {
    if (timer) clearTimeout(timer);
    unsubscribe();
    await pool.end();
  }
}
void main();
