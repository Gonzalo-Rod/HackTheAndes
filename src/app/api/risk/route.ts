import { connection } from "next/server";
import { readRisk } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readRisk(request);
}
