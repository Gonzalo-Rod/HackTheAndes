import { createClient } from "@supabase/supabase-js";
import { RealtimeConfigSchema } from "@/contracts/platform";
import { getJson } from "@/integrations/http/fetch-json";

export type RealtimeState = "connecting" | "live" | "polling";
export async function subscribeToIncidentChanges(onChange: () => void, onState: (state: RealtimeState) => void): Promise<() => void> {
  const parsed = RealtimeConfigSchema.safeParse(
    await getJson("/api/realtime", { provider: "dashboard-api", operation: "realtime.config", retries: 0 }),
  );
  if (!parsed.success) throw new Error("Invalid realtime configuration");
  return connectIncidentChanges(parsed.data, onChange, onState);
}

export function connectIncidentChanges(
  config: { url: string; publishableKey: string },
  onChange: () => void,
  onState: (state: RealtimeState) => void,
): () => void {
  // Only the publishable key reaches the browser. The subscribed row contains no incident data.
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { timeout: 8000 },
  });
  const channel = client
    .channel("incident-updates")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "incident_updates", filter: "id=eq.1" }, onChange)
    .subscribe((status) =>
      onState(
        status === "SUBSCRIBED"
          ? "live"
          : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"
            ? "polling"
            : "connecting",
      ),
    );
  return () => {
    void client.removeChannel(channel).finally(() => client.realtime.disconnect());
  };
}
