import { connection } from "next/server";
import { readWeatherHistory } from "@/services/platform/data-inputs";
export async function GET(request: Request) {
  await connection();
  return readWeatherHistory(request);
}
