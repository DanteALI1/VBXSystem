/**
 * Allowlist matcher for scan targets (CIDR or URL prefix).
 * No network I/O — pure validation used by scan enqueue path.
 */

export type AllowlistEntry = {
  pattern: string;
  patternType: "cidr" | "url";
  enabled: boolean;
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const octet = Number(p);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) + octet;
  }
  return n >>> 0;
}

function parseCidr(cidr: string): { network: number; mask: number } | null {
  const [ip, bitsRaw] = cidr.split("/");
  if (!ip || bitsRaw === undefined) return null;
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const network = ipv4ToInt(ip);
  if (network === null) return null;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { network: (network & mask) >>> 0, mask };
}

function ipInCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  const addr = ipv4ToInt(ip);
  if (!parsed || addr === null) return false;
  return (addr & parsed.mask) >>> 0 === parsed.network;
}

function extractHost(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) return null;
  // bare IP
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return trimmed;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    const u = new URL(withScheme);
    return u.hostname || null;
  } catch {
    return null;
  }
}

function urlMatches(target: string, pattern: string): boolean {
  const t = target.trim().toLowerCase();
  const p = pattern.trim().toLowerCase();
  if (!t || !p) return false;
  return t === p || t.startsWith(p.endsWith("/") ? p : `${p}/`) || t.startsWith(p);
}

/**
 * Returns true if every target is covered by at least one enabled allowlist entry.
 */
export function targetsAllowed(
  targets: string[],
  allowlist: AllowlistEntry[],
): { ok: true } | { ok: false; rejected: string[] } {
  const enabled = allowlist.filter((e) => e.enabled);
  const rejected: string[] = [];

  for (const target of targets) {
    const host = extractHost(target);
    const allowed = enabled.some((entry) => {
      if (entry.patternType === "cidr") {
        if (!host) return false;
        // host may be hostname — only CIDR matches IPs
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
        return ipInCidr(host, entry.pattern);
      }
      return urlMatches(target, entry.pattern) || (host ? urlMatches(host, entry.pattern) : false);
    });
    if (!allowed) rejected.push(target);
  }

  return rejected.length === 0 ? { ok: true } : { ok: false, rejected };
}
