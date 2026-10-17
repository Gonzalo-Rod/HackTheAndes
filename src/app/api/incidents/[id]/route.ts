import { connection } from "next/server";
import { readIncidentDetail } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readIncidentDetail(request);
}
