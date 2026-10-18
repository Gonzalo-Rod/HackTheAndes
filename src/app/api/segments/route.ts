import { connection } from "next/server";
import { readSegments } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readSegments(request);
}
