import { connection } from "next/server";
import { readWhatsAppContact } from "@/services/platform/dashboard";
export async function GET(request: Request): Promise<Response> {
  await connection();
  return readWhatsAppContact(request);
}
