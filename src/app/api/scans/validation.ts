import { z } from "zod";

export const scanTypeSchema = z.enum(["nmap", "nuclei", "zap", "openvas"]);

export const scanCreateSchema = z.object({
  type: scanTypeSchema,
  /** Single target or list — all must pass allowlist. */
  target: z.string().min(1).optional(),
  targets: z.array(z.string().min(1)).min(1).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
}).superRefine((val, ctx) => {
  const hasTarget = Boolean(val.target?.trim());
  const hasTargets = Array.isArray(val.targets) && val.targets.length > 0;
  if (!hasTarget && !hasTargets) {
    ctx.addIssue({
      code: "custom",
      message: "Provide target or targets",
      path: ["targets"],
    });
  }
});

export function normalizeTargets(body: z.infer<typeof scanCreateSchema>): string[] {
  if (body.targets?.length) return body.targets.map((t) => t.trim()).filter(Boolean);
  if (body.target?.trim()) return [body.target.trim()];
  return [];
}
