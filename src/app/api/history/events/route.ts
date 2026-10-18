import { connection } from "next/server";
import { readEventHistory } from "@/services/platform/data-inputs";
export async function GET(request: Request) {
  await connection();
  return readEventHistory(request);
}
