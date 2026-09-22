import { z } from "zod";

/** Accept full URLs, host[:port][/path], or *.host patterns used by matchUrl. */
export function isValidAllowlistUrlPattern(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.length > 2048) return false;

  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    let candidate = trimmed;
    if (!hasScheme) {
      const hostPart = trimmed.startsWith("*.") ? trimmed.slice(2) : trimmed;
      candidate = `https://${hostPart}`;
    } else if (/^[a-z][a-z0-9+.-]*:\/\/\*\./i.test(trimmed)) {
      candidate = trimmed.replace("://*.", "://x.");
    }
    const url = new URL(candidate);
    return Boolean(url.hostname) && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const descriptionSchema = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v));

const baseFields = {
  enabled: z.boolean().optional().default(true),
  description: descriptionSchema,
};

export const createAllowlistSchema = z
  .object({
    pattern: z.string().trim().min(1, "pattern is required").max(2048),
    type: z.enum(["cidr", "url"]),
    ...baseFields,
  })
  .superRefine((data, ctx) => {
    if (data.type === "cidr") {
      const result = z.cidrv4().safeParse(data.pattern);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: ["pattern"],
          message: "invalid CIDR (expected IPv4 CIDR, e.g. 10.0.0.0/8)",
        });
      }
    } else if (!isValidAllowlistUrlPattern(data.pattern)) {
      ctx.addIssue({
        code: "custom",
        path: ["pattern"],
        message: "invalid URL/host pattern",
      });
    }
  });

export const updateAllowlistSchema = z
  .object({
    pattern: z.string().trim().min(1).max(2048).optional(),
    type: z.enum(["cidr", "url"]).optional(),
    enabled: z.boolean().optional(),
    description: z.string().trim().max(2000).nullish(),
  })
  .refine(
    (data) =>
      data.pattern !== undefined ||
      data.type !== undefined ||
      data.enabled !== undefined ||
      data.description !== undefined,
    { message: "at least one field required" },
  )
  .superRefine((data, ctx) => {
    if (data.pattern === undefined && data.type === undefined) return;
    const type = data.type;
    const pattern = data.pattern;
    // When only one of type/pattern is patched, validation of the pair happens
    // in the route after merging with the existing row.
    if (pattern === undefined || type === undefined) return;
    if (type === "cidr") {
      const result = z.cidrv4().safeParse(pattern);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: ["pattern"],
          message: "invalid CIDR (expected IPv4 CIDR, e.g. 10.0.0.0/8)",
        });
      }
    } else if (!isValidAllowlistUrlPattern(pattern)) {
      ctx.addIssue({
        code: "custom",
        path: ["pattern"],
        message: "invalid URL/host pattern",
      });
    }
  });

export type CreateAllowlistInput = z.infer<typeof createAllowlistSchema>;
export type UpdateAllowlistInput = {
  pattern?: string;
  type?: "cidr" | "url";
  enabled?: boolean;
  description?: string | null;
};

/** Validate pattern against a resolved type (for PATCH merge). */
export function validateAllowlistPattern(
  type: "cidr" | "url",
  pattern: string,
): string | null {
  if (type === "cidr") {
    return z.cidrv4().safeParse(pattern).success
      ? null
      : "invalid CIDR (expected IPv4 CIDR, e.g. 10.0.0.0/8)";
  }
  return isValidAllowlistUrlPattern(pattern)
    ? null
    : "invalid URL/host pattern";
}
