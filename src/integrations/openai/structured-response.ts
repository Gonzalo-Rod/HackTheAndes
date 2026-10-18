import { z } from "zod";

const responseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })),
});
/** Reject incomplete, refused or multiple-output responses before domain validation. */
export function parseStructuredResponse(body: unknown): unknown {
  const content = responseSchema
    .parse(body)
    .output.filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);
  if (content.length !== 1 || content[0]?.type !== "output_text" || !content[0].text) throw new Error("Invalid structured response");
  return JSON.parse(content[0].text) as unknown;
}
