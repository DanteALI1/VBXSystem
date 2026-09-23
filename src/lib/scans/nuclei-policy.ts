import path from "node:path";
import { NUCLEI_TEMPLATE_DENIED } from "./types";

/** Detection-only template roots relative to SCAN_NUCLEI_TEMPLATES_DIR. */
export const DEFAULT_NUCLEI_ALLOWED_PATHS = ["cves", "vulnerabilities"] as const;

/** Tags / path segments that imply exploit / intrusive behavior — hard deny. */
export const NUCLEI_DENY_TAGS = [
  "intrusive",
  "dos",
  "exploit",
  "rce",
  "brute",
  "fuzz",
] as const;

export class NucleiTemplateDeniedError extends Error {
  readonly code = NUCLEI_TEMPLATE_DENIED;

  constructor(message: string) {
    super(message);
    this.name = "NucleiTemplateDeniedError";
  }
}

export function getNucleiAllowedPaths(): string[] {
  const raw =
    process.env.SCAN_NUCLEI_ALLOWED_PATHS ??
    DEFAULT_NUCLEI_ALLOWED_PATHS.join(",");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validate nuclei template path/tag options.
 * Only detection-oriented classes under cves/ and vulnerabilities/ are allowed.
 * Absolute paths and path escape outside the templates root are rejected.
 * No auto-exploitation flags are accepted here (caller must not pass them).
 */
export function validateNucleiTemplateOptions(
  options: Record<string, unknown>,
): string[] {
  const allowedRoots = getNucleiAllowedPaths();
  const templatesRoot =
    process.env.SCAN_NUCLEI_TEMPLATES_DIR ?? "/opt/nuclei-templates";

  const templatesRaw = options.templates;
  const templates: string[] = Array.isArray(templatesRaw)
    ? templatesRaw.map(String)
    : typeof templatesRaw === "string" && templatesRaw.trim()
      ? [templatesRaw.trim()]
      : [...allowedRoots];

  const tagsRaw = options.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => String(t).toLowerCase())
    : typeof tagsRaw === "string"
      ? tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

  for (const tag of tags) {
    if (
      (NUCLEI_DENY_TAGS as readonly string[]).includes(tag) ||
      tag.includes("exploit") ||
      tag.includes("rce")
    ) {
      throw new NucleiTemplateDeniedError(
        `Nuclei tag denied (detection-only policy): ${tag}`,
      );
    }
  }

  const resolved: string[] = [];
  for (const t of templates) {
    const normalized = t.replace(/\\/g, "/").replace(/^\.\//, "");

    if (path.isAbsolute(normalized)) {
      throw new NucleiTemplateDeniedError(
        "Absolute template paths are not allowed",
      );
    }
    if (
      normalized.includes("..") ||
      normalized.startsWith("/") ||
      normalized.includes(":")
    ) {
      throw new NucleiTemplateDeniedError(
        `Template path escape denied: ${t}`,
      );
    }

    const first = normalized.split("/")[0]?.toLowerCase() ?? "";
    const allowed = allowedRoots.some(
      (root) => first === root.toLowerCase() || normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`),
    );
    if (!allowed) {
      throw new NucleiTemplateDeniedError(
        `Template path outside detection-only allowlist (cves/, vulnerabilities/): ${t}`,
      );
    }

    // Deny exploit-sounding segments even under allowed roots
    const lower = normalized.toLowerCase();
    for (const deny of NUCLEI_DENY_TAGS) {
      if (lower.includes(`/${deny}`) || lower.includes(`${deny}-`)) {
        throw new NucleiTemplateDeniedError(
          `Template path matches deny-list (${deny}): ${t}`,
        );
      }
    }

    resolved.push(path.join(templatesRoot, normalized));
  }

  return resolved;
}
