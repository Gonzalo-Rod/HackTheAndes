/**
 * LOCAL FIXTURE DEMO of the WhatsApp saved-road workflow. Sends no WhatsApp message and calls
 * no external service.
 *
 * Runs the real inbound command routing (chooseReply), saved-road flow and Atomic Memory HTTP
 * adapter. Atomic Memory is the in-process fixture in src/test-fixtures/atomic-memory.ts (not the
 * real service). ESTADO replies come from the real road-alerts service and formatter, with SUTRAN
 * disabled so the service serves the repository's bundled SUTRAN snapshot (labelled as saved data).
 *
 * Usage: npm run saved-road:demo
 */
import { loadBundledAlertsSnapshot } from "@/integrations/sutran/snapshot";
import { createAtomicMemoryRoadStore } from "@/integrations/atomicmemory/saved-road-store";
import { UpstreamError } from "@/integrations/http/fetch-json";
import type { RoadAlertsProvider } from "@/integrations/sutran/sutran-client";
import { createRoadAlertsService } from "@/services/road-alerts-service";
import { chooseReply, type InboundDependencies } from "@/services/inbound/handle-inbound-message";
import { createRoadInformation } from "@/services/inbound/road-information";
import { createSavedRoadFlow, memorySubject } from "@/services/saved-roads/saved-road-flow";
import { createAtomicMemoryFixture } from "@/test-fixtures/atomic-memory";

/** Demo-only values: the fixture key and pepper are not secrets, the numbers are the repo's test numbers. */
const FIXTURE_API_KEY = "local-fixture-key";
const DEMO_PEPPER = "demo-pepper-not-a-secret-0123456789";
const DRIVERS = { "Driver A": "+51 999 111 222", "Driver B": "+51 999 333 444" } as const;
const DEMO_URL = "https://peruroad.invalid";

const offlineSutran: RoadAlertsProvider = {
  endpoint: "offline-demo",
  listAlerts: async () => {
    throw new UpstreamError("SUTRAN disabled in the local demo", "network", "sutran");
  },
  getAlertDetail: async () => {
    throw new UpstreamError("SUTRAN disabled in the local demo", "network", "sutran");
  },
  getAlertHistory: async () => {
    throw new UpstreamError("SUTRAN disabled in the local demo", "network", "sutran");
  },
};

async function main(): Promise<void> {
  // Routine per-call info logs would bury the conversation; warnings and errors stay visible on stderr.
  console.info = () => undefined;

  const fixture = createAtomicMemoryFixture({ apiKey: FIXTURE_API_KEY });
  const store = createAtomicMemoryRoadStore(
    { apiUrl: "https://atomicmemory-fixture.invalid", apiKey: FIXTURE_API_KEY },
    { fetchImpl: (input, init) => fixture.fetch(input, init) },
  );
  const alerts = createRoadAlertsService({ provider: offlineSutran, snapshot: loadBundledAlertsSnapshot() });
  const information = createRoadInformation({
    context: async () => {
      throw new Error("pilot context is not used by ESTADO in this demo");
    },
    exposure: async () => {
      throw new Error("exposure layers are not part of this demo");
    },
    publicUrl: DEMO_URL,
    geometryRevision: "demo",
    national: {
      alerts: async (requestId) => {
        const result = await alerts.getCurrentAlerts({ requestId });
        return result.ok ? result.value : null;
      },
      roads: async () => [],
      locate: async () => null,
    },
  });
  const deps: InboundDependencies = {
    messaging: {
      sendText: async () => {
        throw new Error("the demo never sends WhatsApp messages");
      },
    },
    information,
    intentParser: null,
    savedRoads: createSavedRoadFlow({ store, pepper: DEMO_PEPPER }),
  };

  let sequence = 0;
  async function say(driver: keyof typeof DRIVERS, text: string): Promise<void> {
    const reply = await chooseReply(
      {
        messageId: `demo-${++sequence}`,
        from: DRIVERS[driver],
        channel: "whatsapp",
        messageType: "text",
        text,
        content: null,
        providerTimestamp: null,
      },
      deps,
      `demo-${sequence}`,
    );
    console.log(`\n> ${driver}: ${text}\n${reply.replace(/^/gm, "  ")}`);
  }
  function showStore(): void {
    const subjects = Object.fromEntries(Object.entries(DRIVERS).map(([name, phone]) => [memorySubject(phone, DEMO_PEPPER), name]));
    const rows = fixture.memories.map(
      (memory) => `${subjects[memory.user_id] ?? "?"} (user_id ${memory.user_id.slice(0, 12)}...): ${String(memory.metadata.roadCode)}`,
    );
    console.log(`  [fixture store] ${rows.length ? rows.join("; ") : "empty"}`);
  }
  const step = (title: string) => console.log(`\n=== ${title} ===`);

  console.log("PeruRoad saved road: LOCAL FIXTURE DEMO");
  console.log("Atomic Memory: in-process fixture (src/test-fixtures/atomic-memory.ts), not the real service.");
  console.log("SUTRAN: disabled; ESTADO uses the bundled real snapshot via the real alerts service.");
  console.log("No WhatsApp message is sent and no external service is called.");

  step("1. Driver A saves PE-22 (typed opt-in)");
  await say("Driver A", "GUARDAR CARRETERA PE-22");
  showStore();

  step("2. A bare ESTADO now answers for the saved road");
  await say("Driver A", "ESTADO");

  step("3. Correction: Driver A switches to PE-32");
  await say("Driver A", "guardar carretera pe 32");
  showStore();
  await say("Driver A", "MI CARRETERA");
  await say("Driver A", "ESTADO");

  step("4. Nationwide answer stays one command away");
  await say("Driver A", "ESTADO PERU");

  step("5. Isolation: Driver B has no saved road");
  await say("Driver B", "MI CARRETERA");
  await say("Driver B", "OLVIDAR CARRETERA");
  showStore();

  step("6. Atomic Memory outage (fixture answers 503): replies degrade, nothing is claimed");
  fixture.fail = "http_503";
  await say("Driver A", "ESTADO");
  await say("Driver A", "MI CARRETERA");
  await say("Driver A", "OLVIDAR CARRETERA");
  showStore();
  fixture.fail = "none";

  step("7. Driver A forgets the road (deletion confirmed by readback)");
  await say("Driver A", "OLVIDAR CARRETERA");
  showStore();
  await say("Driver A", "MI CARRETERA");

  const calls = fixture.requests.reduce<Record<string, number>>((count, request) => {
    count[request.method] = (count[request.method] ?? 0) + 1;
    return count;
  }, {});
  console.log(`\nFixture HTTP calls handled in-process: ${JSON.stringify(calls)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
