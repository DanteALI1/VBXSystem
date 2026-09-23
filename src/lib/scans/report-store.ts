import fs from "node:fs/promises";
import path from "node:path";

export function reportsRoot(): string {
  return (
    process.env.SCAN_REPORTS_DIR ??
    path.join(process.cwd(), "storage", "reports")
  );
}

export function reportDirForJob(jobId: string): string {
  return path.join(reportsRoot(), jobId);
}

export async function ensureReportDir(jobId: string): Promise<string> {
  const dir = reportDirForJob(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeReportFile(
  jobId: string,
  filename: string,
  contents: string | Buffer,
): Promise<string> {
  const dir = await ensureReportDir(jobId);
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, contents, "utf8");
  return filePath;
}

export async function readReportFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}
