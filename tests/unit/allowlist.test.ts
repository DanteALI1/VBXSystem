import { describe, expect, it } from "vitest";
import {
  isTargetAllowed,
  matchCidr,
  matchUrl,
} from "@/lib/domain/allowlist";

describe("matchCidr", () => {
  it("matches IPs inside a /24", () => {
    expect(matchCidr("192.168.1.10", "192.168.1.0/24")).toBe(true);
    expect(matchCidr("192.168.2.10", "192.168.1.0/24")).toBe(false);
  });

  it("matches exact /32", () => {
    expect(matchCidr("10.0.0.5", "10.0.0.5/32")).toBe(true);
    expect(matchCidr("10.0.0.6", "10.0.0.5/32")).toBe(false);
  });

  it("rejects invalid input", () => {
    expect(matchCidr("not-an-ip", "10.0.0.0/8")).toBe(false);
    expect(matchCidr("10.0.0.1", "bad")).toBe(false);
  });
});

describe("matchUrl", () => {
  it("matches by hostname", () => {
    expect(matchUrl("https://app.example.com/path", "example.com")).toBe(false);
    expect(matchUrl("https://app.example.com/path", "app.example.com")).toBe(
      true,
    );
  });

  it("matches path prefix", () => {
    expect(
      matchUrl("https://app.example.com/api/v1/x", "https://app.example.com/api"),
    ).toBe(true);
    expect(
      matchUrl("https://app.example.com/other", "https://app.example.com/api"),
    ).toBe(false);
  });
});

describe("isTargetAllowed", () => {
  const rules = [
    { pattern: "10.0.0.0/8", type: "cidr" as const, enabled: true },
    {
      pattern: "https://scan.lab.local",
      type: "url" as const,
      enabled: true,
    },
    { pattern: "192.168.0.0/16", type: "cidr" as const, enabled: false },
  ];

  it("allows IP in enabled CIDR", () => {
    expect(isTargetAllowed("10.1.2.3", rules)).toBe(true);
  });

  it("ignores disabled rules", () => {
    expect(isTargetAllowed("192.168.1.1", rules)).toBe(false);
  });

  it("allows URL targets", () => {
    expect(isTargetAllowed("https://scan.lab.local/jobs", rules)).toBe(true);
  });

  it("returns false when no rules match", () => {
    expect(isTargetAllowed("8.8.8.8", rules)).toBe(false);
  });

  it("returns false for empty rules", () => {
    expect(isTargetAllowed("10.0.0.1", [])).toBe(false);
  });
});
