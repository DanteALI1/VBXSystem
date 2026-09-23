import { describe, expect, it } from "vitest";
import { targetsAllowed } from "@/lib/allowlist/matcher";

describe("targetsAllowed", () => {
  const allowlist = [
    { pattern: "10.0.0.0/8", patternType: "cidr" as const, enabled: true },
    { pattern: "https://intranet.local", patternType: "url" as const, enabled: true },
    { pattern: "192.168.1.0/24", patternType: "cidr" as const, enabled: false },
  ];

  it("allows IP inside enabled CIDR", () => {
    expect(targetsAllowed(["10.1.2.3"], allowlist)).toEqual({ ok: true });
  });

  it("rejects IP outside allowlist", () => {
    const r = targetsAllowed(["8.8.8.8"], allowlist);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected).toContain("8.8.8.8");
  });

  it("ignores disabled CIDR", () => {
    const r = targetsAllowed(["192.168.1.10"], allowlist);
    expect(r.ok).toBe(false);
  });

  it("allows URL prefix match", () => {
    expect(
      targetsAllowed(["https://intranet.local/app"], allowlist),
    ).toEqual({ ok: true });
  });
});
