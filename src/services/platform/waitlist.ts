import type { PlatformConfiguration } from "@/config/env";
import { WaitlistInputSchema } from "@/contracts/platform";
import type { RateLimiter } from "@/db/request-limits";
import type { WaitlistRepository } from "@/db/waitlist";
import { encryptContact, phoneKey } from "@/integrations/security/contacts";
import { failure, readJson, requestBucket } from "./http";

export function createWaitlistService(options: {
  repository: WaitlistRepository;
  limiter: RateLimiter;
  config: PlatformConfiguration;
  now: () => number;
}) {
  return async (request: Request) => {
    const { config, now } = options;
    if (!(await options.limiter.consume(requestBucket(request, config.SESSION_SIGNING_SECRET, "waitlist"), 5, 15 * 60_000, now())))
      failure(429, "rate_limited", "Demasiados intentos. Espera 15 minutos.");
    const input = await readJson(request, WaitlistInputSchema);
    const key = input.phone ? phoneKey(input.phone, config.PHONE_KEY_PEPPER) : null;
    if (!key || !input.phone) failure(400, "invalid_input", "Revisa el teléfono.");
    await options.repository.save({
      input,
      phoneKey: key,
      envelope: encryptContact(input.phone, config.CONTACT_ENCRYPTION_KEY, config.CONTACT_KEY_VERSION),
      now: new Date(now()).toISOString(),
      isTeam: config.TEAM_PHONE_KEYS.includes(key),
      isTest: config.TEST_PHONE_KEYS.includes(key),
    });
    return Response.json({ accepted: true, requestId: input.requestId }, { status: 202 });
  };
}
