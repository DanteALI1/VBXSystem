import { describe, expect, it } from "vitest";
import {
  maxSeverity,
  severityFromCvss,
} from "@/lib/domain/severity";

describe("severityFromCvss", () => {
  it("maps NVD qualitative scale", () => {
    expect(severityFromCvss(null)).toBeNull();
    expect(severityFromCvss(0)).toBe("none");
    expect(severityFromCvss(0.1)).toBe("low");
    expect(severityFromCvss(3.9)).toBe("low");
    expect(severityFromCvss(4.0)).toBe("medium");
    expect(severityFromCvss(6.9)).toBe("medium");
    expect(severityFromCvss(7.0)).toBe("high");
    expect(severityFromCvss(8.9)).toBe("high");
    expect(severityFromCvss(9.0)).toBe("critical");
    expect(severityFromCvss(10)).toBe("critical");
  });

  it("picks more critical of two severities", () => {
    expect(maxSeverity("low", "critical")).toBe("critical");
    expect(maxSeverity(null, "medium")).toBe("medium");
    expect(maxSeverity(null, null)).toBeNull();
  });
});
