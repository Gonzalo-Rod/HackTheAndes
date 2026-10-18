import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { createExposureRepository } from "../src/db/exposure.ts";
import { readBundledExposure } from "../src/integrations/exposure/files.ts";
import { createExposureView } from "../src/domain/exposure/view.ts";
const pool = createDatabasePool(loadDatabaseConfiguration());
try {
  const result = await createExposureRepository(pool).save(await readBundledExposure());
  const view = createExposureView(result.record.assessment, Date.now(), "database");
  console.log(
    JSON.stringify({
      state: result.state,
      assessmentId: result.record.assessment.assessmentId,
      freshness: view.meta.state,
      catchments: view.data.catchments.length,
      segments: view.data.segments.length,
      automatedAlertUse: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      state: "exposure_import_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
