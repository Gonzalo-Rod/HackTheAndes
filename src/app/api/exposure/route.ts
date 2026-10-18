import { connection } from "next/server";
import { readExposure } from "@/services/platform/exposure";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readExposure(request);
}
