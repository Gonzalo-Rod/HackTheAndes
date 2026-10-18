import { connection } from "next/server";
import { readCompany } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readCompany(request);
}
