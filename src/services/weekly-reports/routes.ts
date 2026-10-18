import { z } from "zod";
import { weeklyPeriod } from "@peruroad/road-data/reports";
import { loadGeometryRevision, loadPlatformConfiguration } from "@/config/env";
import { authorizeJob } from "@/services/jobs/authorize";
import { failure, platformRoute, readJson } from "@/services/platform/http";
import { weeklyRuntime } from "./runtime";
import { database } from "@/db/pool";
import { createWeeklyPdfRepository } from "@/db/weekly-pdf";
import { verifyWeeklyPdfAccess } from "@/integrations/security/weekly-pdf-access";
const inputSchema = z.object({ mode: z.enum(["weekly", "retry", "demo"]).default("weekly") }).strict();
export const runWeeklyReports = platformRoute("weekly-pdf.job", async (request) => {
  authorizeJob(request);
  const { mode } = await readJson(request, inputSchema, 512);
  const runtime = weeklyRuntime(),
    now = Date.now(),
    requestId = crypto.randomUUID();
  const targets = await runtime.repository.targets(loadGeometryRevision(), null, mode === "demo");
  const counts = { checked: 0, sent: 0, notified: 0, pending: 0, failed: 0, unchanged: 0, cancelled: 0 };
  for (const target of targets) {
    if (Date.now() - now > 75_000) break;
    const pending = await runtime.repository.latestPending(target.id, Date.now());
    const duePeriod = weeklyPeriod(now, mode === "demo");
    if (mode !== "demo" && !pending && target.consentAt.getTime() > Date.parse(duePeriod.end)) continue;
    const period = mode === "retry" ? (pending ?? duePeriod) : duePeriod;
    if (!period) continue;
    counts.checked++;
    const state = await runtime.dispatch(target, period, requestId);
    counts[state]++;
  }
  return Response.json({ requestId, mode, ...counts });
});
export const downloadWeeklyPdf = platformRoute("weekly-pdf.download", async (request) => {
  const url = new URL(request.url),
    search = url.searchParams;
  if ([...search.keys()].some((key) => key !== "expires" && key !== "signature"))
    failure(401, "unauthorized", "El acceso al PDF no es válido.");
  const id = verifyWeeklyPdfAccess(
    { id: url.pathname.split("/").at(-1), expires: search.get("expires"), signature: search.get("signature") },
    loadPlatformConfiguration().SESSION_SIGNING_SECRET,
    Date.now(),
  );
  if (!id || search.getAll("expires").length !== 1 || search.getAll("signature").length !== 1)
    failure(401, "unauthorized", "El acceso al PDF no es válido o expiró.");
  const platform = loadPlatformConfiguration();
  const file = await createWeeklyPdfRepository(database(), {
    key: platform.CONTACT_ENCRYPTION_KEY,
    version: platform.CONTACT_KEY_VERSION,
  }).pdf(id, Date.now());
  if (!file) failure(404, "not_found", "El PDF no está disponible.");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="PeruRoad-informe-ambiental.pdf"',
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
