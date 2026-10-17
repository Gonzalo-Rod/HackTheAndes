import { connection } from "next/server";
import { readHazardInputs } from "@/services/platform/data-inputs";
export async function GET(request: Request) {
  await connection();
  return readHazardInputs(request);
}
