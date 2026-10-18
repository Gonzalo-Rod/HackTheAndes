import { connection } from "next/server";
import { readReports } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readReports(request);
}
