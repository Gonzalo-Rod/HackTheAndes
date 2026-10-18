import { describe, expect, it, vi } from "vitest";
import { RequestFailure, failure } from "@/services/platform/http";
import { createTripRegistration } from "./register-trip";

const NOW = Date.parse("2026-10-18T05:00:00Z");
const PEPPER = "p".repeat(32);

function setup(options: { authorized?: boolean } = {}) {
  const trips = {
    create: vi.fn(async () => ({ id: "22222222-2222-4222-8222-222222222222", status: "active" as const })),
    corridorBounds: vi.fn(async () => ({ startKm: 0, endKm: 173.9 })),
  };
  const register = createTripRegistration({
    trips,
    requireOrganization: async () => {
      if (options.authorized === false) failure(401, "access_required", "Ingresa tu código de empresa.");
      return { organizationId: "33333333-3333-4333-8333-333333333333" };
    },
    pepper: PEPPER,
    revision: "r",
    now: () => NOW,
  });
  return { register, trips };
}

const request = (body: unknown) =>
  new Request("http://localhost/api/company/trips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const valid = { phone: "999 888 777", originKm: 10.4, destinationKm: 173.9, callConsent: true };

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(RequestFailure);
  return error as RequestFailure;
}

describe("trip registration", () => {
  it("registers a consenting monitor's route with the default truck speed", async () => {
    const { register, trips } = setup();
    const response = await register(request(valid));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      tripId: "22222222-2222-4222-8222-222222222222",
      status: "active",
      distanceReference: "geometry_distance",
    });
    expect(trips.create).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: "+51999888777",
        avgSpeedKmh: 35,
        departAt: new Date(NOW).toISOString(),
        organizationId: "33333333-3333-4333-8333-333333333333",
        phoneKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("requires a company session", async () => {
    expect((await failureOf(setup({ authorized: false }).register(request(valid)))).status).toBe(401);
  });

  it("requires explicit call consent and rejects unknown fields", async () => {
    expect((await failureOf(setup().register(request({ ...valid, callConsent: false })))).code).toBe("invalid_input");
    expect((await failureOf(setup().register(request({ ...valid, isTest: true })))).code).toBe("invalid_input");
  });

  it("rejects numbers that are not Peruvian mobiles", async () => {
    expect((await failureOf(setup().register(request({ ...valid, phone: "+1 415 555 0100" })))).code).toBe("invalid_phone");
  });

  it("rejects routes outside the corridor or shorter than 1 km", async () => {
    expect((await failureOf(setup().register(request({ ...valid, destinationKm: 400 })))).code).toBe("outside_corridor");
    expect((await failureOf(setup().register(request({ ...valid, destinationKm: 10.9 })))).code).toBe("invalid_route");
  });

  it("rejects departures too far in the past or future", async () => {
    const at = (ms: number) => new Date(NOW + ms).toISOString();
    expect((await failureOf(setup().register(request({ ...valid, departAt: at(-13 * 3_600_000) })))).code).toBe("invalid_departure");
    expect((await failureOf(setup().register(request({ ...valid, departAt: at(8 * 24 * 3_600_000) })))).code).toBe("invalid_departure");
  });

  it("keeps trip-mode clients working and stores no watch deadline for them", async () => {
    const { register, trips } = setup();
    const body = await (await register(request({ ...valid, mode: "trip" }))).json();
    expect(body).toMatchObject({ mode: "trip", estimatedArrival: expect.any(String) });
    expect(body).not.toHaveProperty("watchUntil");
    expect(trips.create).toHaveBeenCalledWith(expect.objectContaining({ watchUntil: null }));
  });

  it("registers a continuous route watch from now until the chosen period ends", async () => {
    const { register, trips } = setup();
    const response = await register(request({ ...valid, mode: "route", watchHours: 72 }));
    expect(response.status).toBe(201);
    const watchUntil = new Date(NOW + 72 * 3_600_000).toISOString();
    expect(await response.json()).toMatchObject({ mode: "route", watchUntil });
    expect(trips.create).toHaveBeenCalledWith(expect.objectContaining({ departAt: new Date(NOW).toISOString(), watchUntil }));
  });

  it("bounds the watch period and rejects trip-only fields on a route watch", async () => {
    const route = { ...valid, mode: "route" };
    for (const watchHours of [0, 169, 1.5])
      expect((await failureOf(setup().register(request({ ...route, watchHours })))).code).toBe("invalid_input");
    expect((await failureOf(setup().register(request({ ...route, watchHours: 24, avgSpeedKmh: 40 })))).code).toBe("invalid_input");
    expect((await failureOf(setup().register(request({ ...route, watchHours: 24, destinationKm: 400 })))).code).toBe("outside_corridor");
  });
});
