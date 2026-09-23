import { z } from "zod";

export const updateFindingStatusSchema = z.object({
  status: z.enum(["open", "fixed", "accepted", "false_positive"]),
});

export type UpdateFindingStatusInput = z.infer<typeof updateFindingStatusSchema>;
