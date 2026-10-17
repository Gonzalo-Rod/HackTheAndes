import { after } from "next/server";
import { createZavuWebhook } from "@/services/inbound/zavu-webhook";

// Runs on the default Node.js runtime, which the signature check needs (node:crypto, raw body).
let handle: ((request: Request) => Promise<Response>) | undefined;

export async function POST(request: Request): Promise<Response> {
  handle ??= createZavuWebhook((task) => after(task));
  return handle(request);
}
