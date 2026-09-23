export const NVD_API_BASE_DEFAULT =
  "https://services.nvd.nist.gov/rest/json/cves/2.0";

/** Public (no key) NVD courtesy delay between successful requests. */
export const NVD_NO_KEY_PAUSE_MS = 6_000;

export function getNvdConfig() {
  const syncDays = Number(process.env.NVD_SYNC_DAYS ?? 30);
  const maxRetries = Number(process.env.NVD_MAX_RETRIES ?? 5);
  const timeoutMs = Number(process.env.NVD_REQUEST_TIMEOUT_MS ?? 30_000);
  const resultsPerPage = Number(process.env.NVD_RESULTS_PER_PAGE ?? 2000);

  return {
    baseUrl: process.env.NVD_API_BASE ?? NVD_API_BASE_DEFAULT,
    apiKey: process.env.NVD_API_KEY?.trim() || undefined,
    syncDays: Number.isFinite(syncDays) && syncDays > 0 ? syncDays : 30,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 5,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
    resultsPerPage:
      Number.isFinite(resultsPerPage) && resultsPerPage > 0
        ? Math.min(resultsPerPage, 2000)
        : 2000,
    noKeyPauseMs: NVD_NO_KEY_PAUSE_MS,
  };
}

export type NvdConfig = ReturnType<typeof getNvdConfig>;

/** Format Date for NVD lastMod* query params. */
export function formatNvdDate(d: Date): string {
  // NVD accepts ISO-8601 with milliseconds
  return d.toISOString().replace(/\.\d{3}Z$/, ".000");
}

export function windowStart(days: number, end: Date = new Date()): Date {
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return start;
}
