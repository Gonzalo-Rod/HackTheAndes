export { createSutranIngestionService } from "./ingest-sutran-alerts.ts";
export type { IngestionOptions } from "./ingest-sutran-alerts.ts";
export type {
  OfficialAlertSource,
  OfficialAlertRepository,
  OfficialAlertTransaction,
  StoredOfficialAlert,
  IngestionResult,
  IngestionSummary,
  IngestionLog,
  IngestionIssueCode,
} from "../contracts/ingestion.ts";
export {
  OfficialAlertRepositoryError,
  storedOfficialAlertSchema,
  officialAlertsBatchSchema,
  officialHistoryBatchSchema,
} from "../contracts/ingestion.ts";
export {
  decideOfficialAlertUpdate,
  sourceHistoryKey,
} from "../domain/road-data/official-alert-update.ts";
