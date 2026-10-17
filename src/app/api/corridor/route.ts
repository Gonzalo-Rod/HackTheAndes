import { connection } from "next/server";
import { readCorridor } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readCorridor(request);
}
