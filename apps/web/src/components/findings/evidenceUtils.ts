import type { Finding } from "./types";

type Evidence = Record<string, unknown>;

export function asEvidence(raw: unknown): Evidence {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Evidence;
  }
  return {};
}

export function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Full-size screenshot / primary image URL when available. Prefer artifact over tiny thumb. */
export function findingFullImageSrc(finding: Finding): string | null {
  const ev = asEvidence(finding.evidence);
  const artifactKey = str(ev.artifact_key);
  if (artifactKey) {
    return artifactUrl(finding.id, artifactKey);
  }

  const full = str(ev.image_url || ev.screenshot_url || ev.full_url);
  if (full) {
    return full.startsWith("data:") || full.startsWith("/") || /^https?:/i.test(full)
      ? full
      : artifactUrl(finding.id, full);
  }

  const path = str(ev.screenshot_path || ev.artifact_path).replace(/\\/g, "/");
  if (path) {
    const idx = path.indexOf("gowitness/");
    if (idx >= 0) return artifactUrl(finding.id, path.slice(idx));
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) return artifactUrl(finding.id, parts.slice(-3).join("/"));
  }

  return null;
}

/** Preview URL: full artifact first, then tiny thumbnail_b64 fallback. */
export function findingThumbSrc(finding: Finding): string | null {
  const full = findingFullImageSrc(finding);
  if (full) return full;

  const ev = asEvidence(finding.evidence);
  const b64 = str(ev.thumbnail_b64 || ev.thumbnail);
  if (b64) {
    const fmt = str(ev.thumbnail_format || ev.image_format || "png").replace(/^\./, "") || "png";
    if (b64.startsWith("data:")) return b64;
    return `data:image/${fmt};base64,${b64}`;
  }

  const thumbKey = str(ev.thumbnail_artifact_key);
  if (thumbKey) return artifactUrl(finding.id, thumbKey);

  const preview = str(ev.preview_url || ev.thumbnail_url || ev.artifact_preview_url);
  if (preview) return preview;

  return null;
}

function resolveArtifactUrl(findingId: number, urlOrPath: string, name?: string): string {
  if (urlOrPath.startsWith("data:") || /^https?:/i.test(urlOrPath)) {
    return urlOrPath;
  }
  if (urlOrPath.startsWith("/api/")) return urlOrPath;
  if (urlOrPath.startsWith("/")) return urlOrPath;
  const file = name || urlOrPath;
  const safe = file
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/api/findings/${findingId}/artifacts/${safe}`;
}

export function artifactUrl(findingId: number, key: string): string {
  return resolveArtifactUrl(findingId, key);
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

/** Port/service rows for nmap-style evidence. */
export function nmapPortRows(ev: Evidence): Array<Record<string, string>> {
  const ports = asList(ev.ports);
  if (ports.length) {
    return ports.map((p) => {
      if (p && typeof p === "object") {
        const row = p as Evidence;
        return {
          port: str(row.port ?? row.Port),
          protocol: str(row.protocol || row.transport || row.proto || "tcp"),
          service: str(row.service || row.name || row.product),
          product: str(row.product),
          version: str(row.version),
          state: str(row.state || "open"),
        };
      }
      return { port: str(p), protocol: "tcp", service: "", product: "", version: "", state: "open" };
    });
  }

  if (ev.port != null || ev.service || ev.product) {
    return [
      {
        port: str(ev.port),
        protocol: str(ev.protocol || ev.transport || "tcp"),
        service: str(ev.service),
        product: str(ev.product),
        version: str(ev.version),
        state: str(ev.state || "open"),
      },
    ];
  }
  return [];
}

export function shodanVulnKeys(ev: Evidence): string[] {
  const vulns = ev.vulns;
  if (vulns && typeof vulns === "object" && !Array.isArray(vulns)) {
    return Object.keys(vulns as object).map((k) => k.toUpperCase());
  }
  if (Array.isArray(vulns)) {
    return vulns.map((v) => str(v).toUpperCase()).filter(Boolean);
  }
  return [];
}
