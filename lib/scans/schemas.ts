import { z } from "zod";

export const scanTypeSchema = z.enum(["nmap", "nuclei", "zap", "openvas"]);

export const createScanSchema = z.object({
  type: scanTypeSchema,
  target: z
    .string()
    .trim()
    .min(1, "target is required")
    .max(2048, "target too long"),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateScanInput = z.infer<typeof createScanSchema>;
