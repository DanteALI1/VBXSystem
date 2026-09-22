import type { NvdApiResponse } from "@/lib/nvd/map";

export const NVD_CVE_API_URL =
  "https://services.nvd.nist.gov/rest/json/cves/2.0";

/** Public NVD rate: ~5 req / 30s without key → ~6s pause between requests. */
export const NVD_NO_KEY_PAUSE_MS = 6_000;

export type SleepFn = (ms: number) => Promise<void>;
export type FetchFn = typeof fetch;

export type NvdClientOptions = {
  apiKey?: string | null;
  baseUrl?: string;
  fetchFn?: FetchFn;
  sleepFn?: SleepFn;
  maxRetries?: number;
  /** Pause between successful pages when no API key (default 6000). */
  noKeyPauseMs?: number;
};

export type NvdFetchParams = {
  startIndex?: number;
  resultsPerPage?: number;
  lastModStartDate?: string;
  lastModEndDate?: string;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null, attempt: number): number {
  if (header) {
    const asInt = Number(header);
    if (!Number.isNaN(asInt) && asInt >= 0) {
      // Retry-After as seconds
      return asInt * 1000;
    }
    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) {
      return Math.max(0, asDate - Date.now());
    }
  }
  // Exponential backoff with jitter: 2s, 4s, 8s…
  const base = Math.min(60_000, 2_000 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}

export class NvdClient {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;
  private readonly sleepFn: SleepFn;
  private readonly maxRetries: number;
  private readonly noKeyPauseMs: number;
  private lastRequestAt = 0;

  constructor(options: NvdClientOptions = {}) {
    this.apiKey =
      options.apiKey === undefined
        ? (process.env.NVD_API_KEY?.trim() || null)
        : options.apiKey?.trim() || null;
    this.baseUrl = options.baseUrl ?? NVD_CVE_API_URL;
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleepFn = options.sleepFn ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 5;
    this.noKeyPauseMs = options.noKeyPauseMs ?? NVD_NO_KEY_PAUSE_MS;
  }

  get hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  private buildUrl(params: NvdFetchParams): string {
    const url = new URL(this.baseUrl);
    if (params.startIndex != null) {
      url.searchParams.set("startIndex", String(params.startIndex));
    }
    if (params.resultsPerPage != null) {
      url.searchParams.set("resultsPerPage", String(params.resultsPerPage));
    }
    if (params.lastModStartDate) {
      url.searchParams.set("lastModStartDate", params.lastModStartDate);
    }
    if (params.lastModEndDate) {
      url.searchParams.set("lastModEndDate", params.lastModEndDate);
    }
    return url.toString();
  }

  private async respectNoKeyPause(): Promise<void> {
    if (this.apiKey) return;
    const elapsed = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < this.noKeyPauseMs) {
      await this.sleepFn(this.noKeyPauseMs - elapsed);
    }
  }

  async fetchPage(params: NvdFetchParams = {}): Promise<NvdApiResponse> {
    const url = this.buildUrl(params);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers.apiKey = this.apiKey;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.respectNoKeyPause();
      this.lastRequestAt = Date.now();

      const res = await this.fetchFn(url, { headers });

      if (res.status === 429) {
        if (attempt >= this.maxRetries) {
          throw new Error(
            `NVD rate limited after ${this.maxRetries + 1} attempts`,
          );
        }
        const waitMs = parseRetryAfterMs(
          res.headers.get("Retry-After"),
          attempt,
        );
        await this.sleepFn(waitMs);
        continue;
      }

      if (!res.ok) {
        lastError = new Error(`NVD HTTP ${res.status}: ${await res.text()}`);
        // Retry 5xx
        if (res.status >= 500 && attempt < this.maxRetries) {
          await this.sleepFn(parseRetryAfterMs(null, attempt));
          continue;
        }
        throw lastError;
      }

      return (await res.json()) as NvdApiResponse;
    }

    throw lastError ?? new Error("NVD fetch failed");
  }

  /**
   * Paginate through all results for the given window.
   * Yields each page response.
   */
  async *paginate(
    params: Omit<NvdFetchParams, "startIndex"> & {
      resultsPerPage?: number;
    } = {},
  ): AsyncGenerator<NvdApiResponse> {
    const resultsPerPage = params.resultsPerPage ?? 2000;
    let startIndex = 0;
    let total = Infinity;

    while (startIndex < total) {
      const page = await this.fetchPage({
        ...params,
        startIndex,
        resultsPerPage,
      });
      total = page.totalResults ?? 0;
      yield page;
      const count = page.vulnerabilities?.length ?? 0;
      if (count === 0) break;
      startIndex += page.resultsPerPage || count;
      if (startIndex >= total) break;
    }
  }
}

export function formatNvdDate(d: Date): string {
  // NVD expects ISO-8601 with timezone, e.g. 2021-08-04T13:00:00.000Z
  return d.toISOString();
}
