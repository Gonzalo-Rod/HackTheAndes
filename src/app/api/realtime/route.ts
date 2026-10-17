import { connection } from "next/server";
import { readRealtime } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readRealtime(request);
}
