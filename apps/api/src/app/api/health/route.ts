export const dynamic = "force-dynamic";

/** Liveness only; does not claim that providers, persistence, or scheduled jobs are healthy. */
export async function GET(): Promise<Response> {
  return Response.json(
    { service: "peruroad-api", status: "ok" },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
