import { z } from "zod";

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;

export function isValidIpv4(ip: string): boolean {
  return IPV4_RE.test(ip.trim());
}

export function isValidHostname(host: string): boolean {
  const h = host.trim();
  if (!h || h.length > 253) return false;
  if (isValidIpv4(h)) return true;
  return HOSTNAME_RE.test(h);
}

export const assetCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    hostname: z.string().trim().max(253).nullable().optional(),
    ip: z.string().trim().max(45).nullable().optional(),
    environment: z.string().trim().max(64).nullable().optional(),
    criticality: z.number().int().min(1).max(5).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.ip != null && val.ip !== "" && !isValidIpv4(val.ip)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid IPv4 address",
        path: ["ip"],
      });
    }
    if (
      val.hostname != null &&
      val.hostname !== "" &&
      !isValidHostname(val.hostname)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid hostname",
        path: ["hostname"],
      });
    }
  });

export const assetPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(256).optional(),
    hostname: z.string().trim().max(253).nullable().optional(),
    ip: z.string().trim().max(45).nullable().optional(),
    environment: z.string().trim().max(64).nullable().optional(),
    criticality: z.number().int().min(1).max(5).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.ip != null && val.ip !== "" && !isValidIpv4(val.ip)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid IPv4 address",
        path: ["ip"],
      });
    }
    if (
      val.hostname != null &&
      val.hostname !== "" &&
      !isValidHostname(val.hostname)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid hostname",
        path: ["hostname"],
      });
    }
  });

export const serviceCreateSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .default("tcp")
    .transform((v) => v.toLowerCase()),
  name: z.string().trim().max(128).nullable().optional(),
  product: z.string().trim().max(128).nullable().optional(),
  version: z.string().trim().max(128).nullable().optional(),
  banner: z.string().trim().max(2000).nullable().optional(),
});

export function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}
