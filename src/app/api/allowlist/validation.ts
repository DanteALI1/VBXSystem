import { z } from "zod";
import { targetsAllowed } from "@/lib/allowlist/matcher";

function isValidCidr(cidr: string): boolean {
  const [ip, bitsRaw] = cidr.trim().split("/");
  if (!ip || bitsRaw === undefined) return false;
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    const octet = Number(p);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return false;
  }
  return true;
}

function isValidUrlPattern(pattern: string): boolean {
  const p = pattern.trim();
  if (!p || p.length > 2048) return false;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)
      ? p
      : `http://${p}`;
    const u = new URL(withScheme);
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

export const allowlistCreateSchema = z
  .object({
    pattern: z.string().trim().min(1).max(2048),
    patternType: z.enum(["cidr", "url"]),
    enabled: z.boolean().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.patternType === "cidr" && !isValidCidr(val.pattern)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid CIDR pattern",
        path: ["pattern"],
      });
    }
    if (val.patternType === "url" && !isValidUrlPattern(val.pattern)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid URL pattern",
        path: ["pattern"],
      });
    }
  });

export const allowlistPatchSchema = z
  .object({
    pattern: z.string().trim().min(1).max(2048).optional(),
    patternType: z.enum(["cidr", "url"]).optional(),
    enabled: z.boolean().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((val) => {
    if (val.pattern === undefined && val.patternType === undefined) return;
    // When either changes, both sides must be known for validation — caller merges.
  });

/** Validate a fully-resolved pattern+type pair (after PATCH merge). */
export function validatePatternPair(
  pattern: string,
  patternType: "cidr" | "url",
): string | null {
  if (patternType === "cidr" && !isValidCidr(pattern)) {
    return "Invalid CIDR pattern";
  }
  if (patternType === "url" && !isValidUrlPattern(pattern)) {
    return "Invalid URL pattern";
  }
  return null;
}

/** Preview whether sample targets would be allowed by a candidate entry. */
export function previewAllowlistMatch(
  pattern: string,
  patternType: "cidr" | "url",
  enabled: boolean,
  samples: string[],
): { ok: true } | { ok: false; rejected: string[] } {
  return targetsAllowed(samples, [{ pattern, patternType, enabled }]);
}

export function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}
