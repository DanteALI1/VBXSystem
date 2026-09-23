import { accessSync, constants, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function projectRoot(): string {
  return process.cwd();
}

export function fixturePath(...parts: string[]): string {
  return join(projectRoot(), "tests", "fixtures", ...parts);
}

export function reportDirForJob(jobId: string): string {
  return join(projectRoot(), "storage", "reports", jobId);
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeMeta(
  reportDir: string,
  meta: Record<string, unknown>,
): string {
  const path = join(reportDir, "meta.json");
  writeFileSync(path, JSON.stringify(meta, null, 2), "utf8");
  return path;
}

export function copyFixtureTo(destPath: string, fixtureRelative: string): void {
  ensureDir(dirname(destPath));
  copyFileSync(fixturePath(fixtureRelative), destPath);
}

/** Which binary basename to look for on PATH (or absolute override via env). */
export function resolveBinary(
  envKey: string,
  fallbackName: string,
): string | null {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) {
    try {
      accessSync(fromEnv, constants.X_OK);
      return fromEnv;
    } catch {
      return null;
    }
  }
  return whichSync(fallbackName);
}

function whichSync(name: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(":")) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Fixture mode when:
 * - job.options.fixture === true
 * - SCAN_FIXTURE_MODE=1|true
 * - scanner binary is not found
 */
export function shouldUseFixtureMode(
  options: Record<string, unknown>,
  binaryPath: string | null,
): boolean {
  if (options.fixture === true) return true;
  const env = (process.env.SCAN_FIXTURE_MODE ?? "").trim().toLowerCase();
  if (env === "1" || env === "true" || env === "yes") return true;
  return binaryPath == null;
}

export async function runCommand(
  bin: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(bin, args, {
    timeout: opts?.timeoutMs ?? 120_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    stdout: typeof stdout === "string" ? stdout : String(stdout),
    stderr: typeof stderr === "string" ? stderr : String(stderr),
  };
}

export function extractIpFromTarget(target: string): string | null {
  const trimmed = target.trim();
  const ipOnly = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipOnly) return ipOnly[1];
  const embedded = trimmed.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return embedded ? embedded[1] : null;
}

export function extractHostnameFromTarget(target: string): string | null {
  const trimmed = target.trim();
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    if (url.hostname && !/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) {
      return url.hostname;
    }
  } catch {
    // fall through
  }
  if (/^[A-Za-z0-9.-]+$/.test(trimmed) && trimmed.includes(".")) {
    return trimmed;
  }
  return null;
}
