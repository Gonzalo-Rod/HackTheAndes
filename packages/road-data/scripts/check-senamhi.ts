import { randomUUID } from "node:crypto";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { createSenamhiWarningAccessProbe } from "../src/integrations/senamhi/warning-access.ts";

const requestId = randomUUID();
const startedAt = performance.now();
try {
  const result = await createSenamhiWarningAccessProbe({
    transport: createFetchJsonTransport(),
  }).check({ requestId });
  console.log(JSON.stringify(result, null, 2));
  console.error(
    JSON.stringify({
      requestId,
      operation: "senamhi.probe",
      provider: "senamhi",
      durationMs: performance.now() - startedAt,
      result: "success",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      requestId,
      operation: "senamhi.probe",
      provider: "senamhi",
      durationMs: performance.now() - startedAt,
      result: "failure",
      state: "unavailable",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "SENAMHI access could not be verified. Do not interpret unavailable warnings as an absence of hazards.",
    }),
  );
  process.exitCode = 1;
}
