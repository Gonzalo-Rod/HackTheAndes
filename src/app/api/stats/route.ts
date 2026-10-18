import { connection } from "next/server";
import { readStats } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readStats(request);
}
