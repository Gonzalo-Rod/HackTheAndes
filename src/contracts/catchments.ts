import { z } from "zod";
import { catchmentSnapshotSchema } from "@peruroad/road-data/catchments/contracts";
export const CatchmentLayerSchema = z.object({
  data: catchmentSnapshotSchema,
  meta: z.object({ state: z.enum(["database", "snapshot"]), servedAt: z.iso.datetime(), message: z.string() }),
});
export type CatchmentLayer = z.infer<typeof CatchmentLayerSchema>;
