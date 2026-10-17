import { connection } from "next/server";
import { readCatchmentRain } from "@/services/platform/data-inputs";
export async function GET(request: Request) {
  await connection();
  return readCatchmentRain(request);
}
