import { createSutranAdapter, createFetchJsonTransport } from "../src/integrations/sutran/index.ts";

const adapter = createSutranAdapter({ transport: createFetchJsonTransport() });
try {
  const batch = await adapter.fetchCurrentAlerts();
  console.log(JSON.stringify(batch, null, 2));
  if (!batch.complete) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      source: "sutran",
      state: "unavailable",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "Official road data is temporarily unavailable. No current road status can be confirmed.",
    }),
  );
  process.exitCode = 1;
}
