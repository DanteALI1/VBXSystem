import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type AdapterMode = "auto" | "fixture" | "binary";

export function getAdapterMode(): AdapterMode {
  const raw = (process.env.SCAN_ADAPTER_MODE ?? "auto").toLowerCase();
  if (raw === "fixture" || raw === "binary" || raw === "auto") return raw;
  return "auto";
}

export function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

/** Resolve binary on PATH; returns null if missing. */
export function findBinary(name: string): string | null {
  const override = process.env[`SCAN_${name.toUpperCase()}_BIN`];
  if (override) {
    return fs.existsSync(override) ? override : null;
  }
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(path.delimiter)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function shouldUseFixture(binaryName: string): boolean {
  const mode = getAdapterMode();
  if (mode === "fixture") return true;
  if (mode === "binary") return false;
  return findBinary(binaryName) === null;
}

export async function runCommand(
  bin: string,
  args: string[],
  opts?: { timeoutMs?: number; cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(bin, args, {
    timeout: opts?.timeoutMs ?? 120_000,
    cwd: opts?.cwd,
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  return {
    stdout: typeof stdout === "string" ? stdout : String(stdout),
    stderr: typeof stderr === "string" ? stderr : String(stderr),
  };
}
