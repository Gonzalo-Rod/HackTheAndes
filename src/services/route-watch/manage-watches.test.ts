import { describe, expect, it, vi } from "vitest";
import { RequestFailure, failure } from "@/services/platform/http";
import { createWatchManagement } from "./manage-watches";

const ORG = "33333333-3333-4333-8333-333333333333";
const ID = "22222222-2222-4222-8222-222222222222";
function setup(options: { authorized?: boolean; cancelled?: boolean } = {}) {
  const trips = {
    listForOrganization: vi.fn(async () => []),
    cancelForOrganization: vi.fn(async () => options.cancelled ?? true),
  };
  const manage = createWatchManagement({
    trips,
    requireOrganization: async () => {
      if (options.authorized === false) failure(401, "access_required", "Ingresa tu código de empresa.");
      return { organizationId: ORG };
    },
  });
  return { manage, trips };
}
const request = (headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/company/trips/${ID}`, { method: "DELETE", headers });
async function failureOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(RequestFailure);
  return error as RequestFailure;
}

describe("watch management", () => {
  it("lists only the session organization's watches", async () => {
    const { manage, trips } = setup();
    expect(await (await manage.list(request())).json()).toEqual({ watches: [] });
    expect(trips.listForOrganization).toHaveBeenCalledWith(ORG);
  });

  it("requires a company session to list or cancel", async () => {
    expect((await failureOf(setup({ authorized: false }).manage.list(request()))).status).toBe(401);
    expect((await failureOf(setup({ authorized: false }).manage.cancel(request(), ID))).status).toBe(401);
  });

  it("cancels within the organization and hides unknown or foreign watches behind 404", async () => {
    const { manage, trips } = setup();
    expect(await (await manage.cancel(request(), ID)).json()).toEqual({ cancelled: true });
    expect(trips.cancelForOrganization).toHaveBeenCalledWith(ORG, ID);
    expect((await failureOf(setup({ cancelled: false }).manage.cancel(request(), ID))).status).toBe(404);
  });

  it("rejects malformed ids and cross-origin requests", async () => {
    expect((await failureOf(setup().manage.cancel(request(), "1 or 1=1"))).code).toBe("invalid_input");
    expect((await failureOf(setup().manage.cancel(request({ origin: "https://evil.test" }), ID))).code).toBe("invalid_origin");
  });
});
