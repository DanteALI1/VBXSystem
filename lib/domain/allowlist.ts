export type AllowlistRule = {
  pattern: string;
  type: "cidr" | "url";
  enabled?: boolean;
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

function parseCidr(cidr: string): { network: number; mask: number } | null {
  const [ipPart, prefixPart] = cidr.trim().split("/");
  if (!ipPart || prefixPart === undefined) return null;
  const network = ipv4ToInt(ipPart);
  const prefix = Number(prefixPart);
  if (network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return null;
  }
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { network: (network & mask) >>> 0, mask };
}

/** Match an IPv4 address against a CIDR pattern (e.g. 10.0.0.0/8). */
export function matchCidr(ip: string, cidr: string): boolean {
  const addr = ipv4ToInt(ip.trim());
  const parsed = parseCidr(cidr);
  if (addr === null || parsed === null) return false;
  return (addr & parsed.mask) >>> 0 === parsed.network;
}

/**
 * Match a URL/host target against an allowlist URL pattern.
 * Pattern may be a full URL, host, or host with optional path prefix.
 */
export function matchUrl(target: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase();
  const normalizedTarget = target.trim().toLowerCase();
  if (!normalizedPattern || !normalizedTarget) return false;

  try {
    const patternHasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedPattern);
    const targetHasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedTarget);

    const patternUrl = new URL(
      patternHasScheme ? normalizedPattern : `https://${normalizedPattern}`,
    );
    const targetUrl = new URL(
      targetHasScheme ? normalizedTarget : `https://${normalizedTarget}`,
    );

    if (patternUrl.hostname !== targetUrl.hostname) {
      // also allow wildcard host prefix like *.example.com via leading *.
      if (normalizedPattern.startsWith("*.")) {
        const suffix = normalizedPattern.slice(1); // .example.com
        if (
          !targetUrl.hostname.endsWith(suffix) &&
          targetUrl.hostname !== normalizedPattern.slice(2)
        ) {
          return false;
        }
      } else {
        return false;
      }
    }

    const patternPath = patternUrl.pathname === "/" ? "" : patternUrl.pathname;
    if (!patternPath) return true;
    return (
      targetUrl.pathname === patternPath ||
      targetUrl.pathname.startsWith(
        patternPath.endsWith("/") ? patternPath : `${patternPath}/`,
      ) ||
      targetUrl.pathname.startsWith(patternPath)
    );
  } catch {
    // Fallback: substring / equality match for non-URL strings
    return (
      normalizedTarget === normalizedPattern ||
      normalizedTarget.includes(normalizedPattern)
    );
  }
}

/** Returns true if the target matches any enabled allowlist rule. */
export function isTargetAllowed(
  target: string,
  rules: AllowlistRule[],
): boolean {
  const enabled = rules.filter((r) => r.enabled !== false);
  if (enabled.length === 0) return false;

  const trimmed = target.trim();
  const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed);

  for (const rule of enabled) {
    if (rule.type === "cidr") {
      if (looksLikeIp && matchCidr(trimmed, rule.pattern)) return true;
      // target may be host:port or URL containing IP
      const ipMatch = trimmed.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (ipMatch && matchCidr(ipMatch[1], rule.pattern)) return true;
    } else if (rule.type === "url") {
      if (matchUrl(trimmed, rule.pattern)) return true;
    }
  }
  return false;
}
