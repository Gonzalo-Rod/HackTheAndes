import { connection } from "next/server";
import { readForecastRoads } from "@/services/platform/exposure";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readForecastRoads(request);
}
