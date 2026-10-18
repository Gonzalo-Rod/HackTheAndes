import { connection } from "next/server";
import { listWatches, registerTrip } from "@/services/route-watch/runtime";
export const POST = registerTrip;
export async function GET(request: Request): Promise<Response> {
  await connection();
  return listWatches(request);
}
