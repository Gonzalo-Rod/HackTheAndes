import { connection } from "next/server";
import { readCatchmentLayer } from "@/services/platform/catchments";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readCatchmentLayer(request);
}
