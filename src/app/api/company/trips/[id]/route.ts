import { cancelWatch } from "@/services/route-watch/runtime";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return cancelWatch(request, (await params).id);
}
