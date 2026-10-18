import { connection } from "next/server";
import { readNationalWarnings } from "@/services/platform/national-warnings";
export async function GET(request: Request) {
  await connection();
  return readNationalWarnings(request);
}
