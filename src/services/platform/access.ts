import { activePass, type Feature } from "@/domain/access/entitlements";
import { keyedDigest, equalDigest } from "@/integrations/security/contacts";
import { readSession, SESSION_COOKIE, SESSION_DURATION_MS, signSession } from "@/integrations/security/session";
import type { AccessRepository } from "@/db/access";
import type { RateLimiter } from "@/db/request-limits";
import { AccessCodeInputSchema } from "@/contracts/platform";
import { failure, readJson, requestBucket } from "./http";

interface Options {
  repository: AccessRepository;
  limiter: RateLimiter;
  secret: string;
  now: () => number;
}
export function createAccessService(options: Options) {
  const { repository, limiter, secret, now } = options;
  async function requireAccess(request: Request, feature: Feature = "dashboard") {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
    const session = readSession(token, secret, now());
    if (!session) failure(401, "access_required", "Ingresa tu código de empresa.");
    const pass = activePass(await repository.passes(session.organizationId), { organizationId: session.organizationId }, feature, now());
    if (!pass) failure(403, "pass_required", "Tu acceso no está activo para esta función.");
    return { organizationId: session.organizationId, pass };
  }
  return {
    requireAccess,
    async login(request: Request) {
      if (!(await limiter.consume(requestBucket(request, secret, "login"), 5, 15 * 60_000, now())))
        failure(429, "rate_limited", "Demasiados intentos. Espera 15 minutos.");
      const { code } = await readJson(request, AccessCodeInputSchema);
      const hash = keyedDigest(code, secret, "organization-code-v1");
      const organization = await repository.findOrganization(hash);
      if (!organization || !equalDigest(organization.hash, hash)) failure(401, "invalid_code", "Código no válido.");
      const issuedAtMs = now();
      const pass = activePass(await repository.passes(organization.id), { organizationId: organization.id }, "dashboard", issuedAtMs);
      if (!pass || !pass.expiresAt) failure(403, "pass_required", "El acceso de empresa no está activo.");
      const expiresAtMs = Math.min(issuedAtMs + SESSION_DURATION_MS, Date.parse(pass.expiresAt));
      const token = signSession({ organizationId: organization.id, issuedAtMs, expiresAtMs }, secret);
      const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
      return Response.json(
        { organizationId: organization.id, expiresAt: new Date(expiresAtMs).toISOString() },
        {
          headers: {
            "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((expiresAtMs - issuedAtMs) / 1000)}${secure}`,
          },
        },
      );
    },
    async reports(request: Request) {
      const { organizationId } = await requireAccess(request);
      return Response.json({ reports: await repository.reports(organizationId) });
    },
  };
}
