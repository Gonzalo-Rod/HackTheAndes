import { connection } from "next/server";
import { readNationalRoadHistory } from "@/services/platform/road-history";

// GET /api/history/road-events — nationwide past emergencies (contract: src/contracts/road-history.ts).
export async function GET(request: Request) {
  await connection();
  return readNationalRoadHistory(request);
}
