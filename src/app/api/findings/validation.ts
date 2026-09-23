import { z } from "zod";
import { FINDING_STATUSES } from "@/lib/findings/status";

export const findingStatusSchema = z.enum(FINDING_STATUSES);

export const findingPatchSchema = z.object({
  status: findingStatusSchema,
});

export const SEVERITY_VALUES = [
  "none",
  "low",
  "medium",
  "high",
  "critical",
] as const;
