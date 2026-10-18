import { connection } from "next/server";
import { readIncidents } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readIncidents(request);
}
