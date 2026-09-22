import { z } from "zod";

const hostnameSchema = z
  .string()
  .trim()
  .min(1, "hostname is required")
  .max(253, "hostname too long")
  .regex(
    /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/,
    "invalid hostname",
  );

const ipv4Schema = z.ipv4({ error: "invalid IPv4 address" });

export const createAssetSchema = z.object({
  hostname: hostnameSchema,
  ip: ipv4Schema,
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v)),
});

export const updateAssetSchema = z
  .object({
    hostname: hostnameSchema.optional(),
    ip: ipv4Schema.optional(),
    description: z.string().trim().max(2000).nullish(),
  })
  .refine(
    (data) =>
      data.hostname !== undefined ||
      data.ip !== undefined ||
      data.description !== undefined,
    { message: "at least one field required" },
  );

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
