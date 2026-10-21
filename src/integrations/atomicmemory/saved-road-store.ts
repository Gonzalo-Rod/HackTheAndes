import { z } from "zod";
import type { SavedRoadRecord, SavedRoadStore } from "@/contracts/saved-roads";
import { parseRoadCode } from "@/domain/messaging/dashboard-links";
import { deleteJson, getJson, postJson, UpstreamError, type RequestOptions } from "@/integrations/http/fetch-json";

// Atomic Memory HTTP API (https://docs.atomicstrata.ai/api-reference/http/atomicmemory-http-api):
// verbatim quick ingest, list and delete-by-id, all scoped by user_id only. Namespace and thread
// are not used: on Cloud a thread replaces the subject, so it cannot add isolation.

const PROVIDER = "atomicmemory";
/** Groups this feature's records so list and cleanup never touch other memories of the subject. */
export const SAVED_ROAD_SOURCE_SITE = "peruroad-whatsapp";
const SAVED_ROAD_KIND = "saved_road";
/** Caller-owned ID: the SDK docs say re-ingest with the same externalId updates the record in place. */
const SAVED_ROAD_EXTERNAL_ID = "peruroad-saved-road";
/** The recall sits on the WhatsApp reply path; a slow provider must not delay ESTADO noticeably. */
export const RECALL_TIMEOUT_MS = 2_000;
const WRITE_TIMEOUT_MS = 4_000;
/** One subject has at most a handful of saved-road records (one, plus any stale leftovers). */
const LIST_LIMIT = 20;

const listResponseSchema = z.object({
  memories: z.array(
    z.object({
      id: z.string().min(1),
      user_id: z.string(),
      created_at: z.string(),
      source_site: z.string().nullish(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    }),
  ),
});
const ingestResponseSchema = z.object({
  stored_memory_ids: z.array(z.string()),
  updated_memory_ids: z.array(z.string()),
});
/** A 2xx alone is not a deletion: the documented body is { success: true }. */
const deleteResponseSchema = z.object({ success: z.literal(true) });
const savedRoadMetadataSchema = z.object({ kind: z.literal(SAVED_ROAD_KIND), roadCode: z.string() });

export function createAtomicMemoryRoadStore(
  config: { apiUrl: string; apiKey: string },
  options: Pick<RequestOptions, "fetchImpl" | "sleep" | "random"> = {},
): SavedRoadStore {
  const request = (operation: string, requestId: string, extra: Partial<RequestOptions> = {}): RequestOptions => ({
    provider: PROVIDER,
    operation,
    requestId,
    headers: { Authorization: `Bearer ${config.apiKey}` },
    // The bearer key must never follow a redirect to another origin.
    redirect: "error",
    ...options,
    ...extra,
  });
  return {
    async list(subject, requestId) {
      const url = new URL("/v1/memories/list", config.apiUrl);
      url.search = new URLSearchParams({ user_id: subject, source_site: SAVED_ROAD_SOURCE_SITE, limit: String(LIST_LIMIT) }).toString();
      const body = listResponseSchema.parse(
        await getJson(url.toString(), request("atomicmemory.list", requestId, { timeoutMs: RECALL_TIMEOUT_MS, retries: 0 })),
      );
      return body.memories.flatMap((memory): SavedRoadRecord[] => {
        // Defense in depth: never act on another subject's or another feature's record.
        if (memory.user_id !== subject || memory.source_site !== SAVED_ROAD_SOURCE_SITE) return [];
        const metadata = savedRoadMetadataSchema.safeParse(memory.metadata);
        const roadCode = metadata.success ? parseRoadCode(metadata.data.roadCode) : null;
        return roadCode ? [{ id: memory.id, roadCode, createdAt: memory.created_at }] : [];
      });
    },
    async save(subject, roadCode, requestId) {
      const response = await postJson(
        new URL("/v1/memories/ingest/quick", config.apiUrl).toString(),
        {
          user_id: subject,
          conversation: `PeruRoad WhatsApp: the driver saved road ${roadCode} as their preferred road for ESTADO and EXPOSICION replies.`,
          source_site: SAVED_ROAD_SOURCE_SITE,
          skip_extraction: true,
          content_class: "summary",
          metadata: { kind: SAVED_ROAD_KIND, roadCode, externalId: SAVED_ROAD_EXTERNAL_ID },
        },
        // A timed-out write is ambiguous; the caller re-reads instead of blindly retrying.
        { ...request("atomicmemory.save", requestId, { timeoutMs: WRITE_TIMEOUT_MS }), idempotent: false },
      );
      const body = ingestResponseSchema.parse(response.body);
      return [...body.stored_memory_ids, ...body.updated_memory_ids];
    },
    async remove(subject, id, requestId) {
      const url = new URL(`/v1/memories/${encodeURIComponent(id)}`, config.apiUrl);
      url.search = new URLSearchParams({ user_id: subject }).toString();
      try {
        deleteResponseSchema.parse(
          await deleteJson(url.toString(), request("atomicmemory.delete", requestId, { timeoutMs: WRITE_TIMEOUT_MS, retries: 1 })),
        );
      } catch (error) {
        // 404 on DELETE only: the record is already absent, which is the requested end state.
        if (error instanceof UpstreamError && error.kind === "http" && error.status === 404) return;
        throw error;
      }
    },
  };
}
