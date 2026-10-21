import { randomUUID } from "node:crypto";
import { z } from "zod";

// Test fixture, NOT Atomic Memory: an in-process stand-in for the three documented routes the
// saved-road adapter calls (quick ingest, list, delete by id), partitioned by user_id and with
// metadata.externalId updating in place. Tests and the local demo use it without credentials.

interface FixtureMemory {
  id: string;
  user_id: string;
  source_site: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AtomicMemoryFixture {
  fetch: typeof fetch;
  memories: FixtureMemory[];
  /**
   * Make the next calls misbehave: an outage, a hang until aborted, or a DELETE that answers
   * 200 { success: true } but keeps the record (exercises the readback confirmation).
   */
  fail: "none" | "http_503" | "timeout" | "delete_retains";
  requests: { method: string; path: string; authorization: string | null }[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ingestSchema = z.object({
  user_id: z.string().min(1),
  source_site: z.string().min(1),
  conversation: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
});

function hang(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
}

export function createAtomicMemoryFixture(options: { apiKey: string; now?: () => number }): AtomicMemoryFixture {
  const now = options.now ?? Date.now;
  const fixture: AtomicMemoryFixture = {
    memories: [],
    fail: "none",
    requests: [],
    async fetch(input, init) {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const method = init?.method ?? "GET";
      const authorization = new Headers(init?.headers).get("authorization");
      fixture.requests.push({ method, path: url.pathname, authorization });
      if (fixture.fail === "timeout") return hang(init?.signal);
      if (fixture.fail === "http_503") return json({ error: "unavailable", retryable: true }, 503);
      if (authorization !== `Bearer ${options.apiKey}`) return json({ error: "unauthorized" }, 401);
      if (method === "GET" && url.pathname === "/v1/memories/list") {
        const userId = url.searchParams.get("user_id");
        const source = url.searchParams.get("source_site");
        const memories = fixture.memories.filter((m) => m.user_id === userId && (!source || m.source_site === source));
        return json({ count: memories.length, memories });
      }
      if (method === "POST" && url.pathname === "/v1/memories/ingest/quick") {
        const parsed = ingestSchema.safeParse(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
        if (!parsed.success) return json({ error: "user_id (string) is required" }, 400);
        const body = parsed.data;
        const externalId = body.metadata.externalId;
        const existing = fixture.memories.find((m) => m.user_id === body.user_id && externalId && m.metadata.externalId === externalId);
        if (existing) {
          Object.assign(existing, { content: body.conversation, metadata: body.metadata, created_at: new Date(now()).toISOString() });
          return json({ episode_id: randomUUID(), memories_stored: 0, stored_memory_ids: [], updated_memory_ids: [existing.id] });
        }
        const memory = {
          id: randomUUID(),
          user_id: body.user_id,
          source_site: body.source_site,
          content: body.conversation,
          metadata: body.metadata,
          created_at: new Date(now()).toISOString(),
        };
        fixture.memories.push(memory);
        // 201 for a new record: the adapter must accept any 2xx, not only 200.
        return json({ episode_id: randomUUID(), memories_stored: 1, stored_memory_ids: [memory.id], updated_memory_ids: [] }, 201);
      }
      const deleted = /^\/v1\/memories\/([^/]+)$/.exec(url.pathname);
      if (method === "DELETE" && deleted) {
        const index = fixture.memories.findIndex((m) => m.id === deleted[1] && m.user_id === url.searchParams.get("user_id"));
        if (index < 0) return json({ error: "Memory not found" }, 404);
        if (fixture.fail !== "delete_retains") fixture.memories.splice(index, 1);
        return json({ success: true });
      }
      return json({ error: "not found" }, 404);
    },
  };
  return fixture;
}
