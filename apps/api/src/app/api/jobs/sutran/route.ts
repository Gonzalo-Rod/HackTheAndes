import { runSutranJob } from "../../../../services/sutran-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;

export async function POST(request: Request): Promise<Response> {
  return runSutranJob(request);
}
