import { runRoadContext } from "../../../../services/road-context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return runRoadContext(request);
}
