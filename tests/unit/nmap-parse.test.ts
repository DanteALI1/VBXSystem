import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNmapXml } from "@/lib/scanners/nmap";

const fixture = readFileSync(
  join(process.cwd(), "tests/fixtures/nmap-sample.xml"),
  "utf8",
);

describe("nmap parse (TC-012)", () => {
  it("parses open ports into services + findings", () => {
    const drafts = parseNmapXml(fixture);

    const withService = drafts.filter((d) => d.service);
    expect(withService.length).toBeGreaterThanOrEqual(3);

    const ports = new Set(withService.map((d) => d.service!.port));
    expect(ports.has(22)).toBe(true);
    expect(ports.has(80)).toBe(true);
    expect(ports.has(443)).toBe(true);
    expect(ports.has(3306)).toBe(false); // closed

    const ssh = withService.find((d) => d.service!.port === 22);
    expect(ssh?.service?.name).toBe("ssh");
    expect(ssh?.service?.product).toBe("OpenSSH");
    expect(ssh?.severity).toBe("info");
  });

  it("extracts script vuln findings with CVE", () => {
    const drafts = parseNmapXml(fixture);
    const vuln = drafts.find((d) => d.cveId === "CVE-2021-44228");
    expect(vuln).toBeTruthy();
    expect(vuln!.title).toMatch(/http-vuln-cve2021-44228/i);
    expect(["high", "critical", "medium"]).toContain(vuln!.severity);
  });
});
