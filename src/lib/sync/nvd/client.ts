import {
  getNvdConfig,
  type NvdConfig,
  NVD_NO_KEY_PAUSE_MS,
} from "./config";
import type { NvdApiResponse, NvdQueryParams } from "./types";

export class NvdHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "NvdHttpError";
  }
}

export class NvdRateLimitError extends NvdHttpError {
  constructor(message: string, status = 429, body?: string) {
    super(message, status, body);
    this.name = "NvdRateLimitError";
  }
}

export type SleepFn = (ms: number) => Promise<void>;
export type FetchFn = typeof fetch;

export type NvdClientOptions = {
  config?: Partial<NvdConfig>;
  fetch?: FetchFn;
  sleep?: SleepFn;
  /** Deterministic jitter override for tests (0..1). */
  random?: () => number;
};

export type NvdClient = {
  fetchPage: (params: NvdQueryParams) => Promise<NvdApiResponse>;
  config: NvdConfig;
};

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff with jitter. attempt is 0-based after first failure.
 * Caps at 60s. Optional Retry-After (seconds) wins when present.
 */
export function computeBackoffMs(
  attempt: number,
  opts?: { retryAfterSec?: number | null; random?: () => number },
): number {
  if (opts?.retryAfterSec != null && opts.retryAfterSec >= 0) {
    return Math.min(120_000, Math.floor(opts.retryAfterSec * 1000));
  }
  const random = opts?.random ?? Math.random;
  const base = Math.min(60_000, 1_000 * 2 ** attempt);
  const jitter = Math.floor(random() * 250);
  return base + jitter;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const when = Date.parse(header);
  if (!Number.isNaN(when)) {
    return Math.max(0, (when - Date.now()) / 1000);
  }
  return null;
}

function buildUrl(baseUrl: string, params: NvdQueryParams): string {
  const url = new URL(baseUrl);
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
  if (params.cveId) {
    url.searchParams.set("cveId", params.cveId);
  }
  return url.toString();
}

/**
 * NVD CVE API 2.0 HTTP client with 429 backoff and no-key inter-request pause.
 * Inject `fetch` / `sleep` in tests — never hit the real API from Gate.
 */
export function createNvdClient(options: NvdClientOptions = {}): NvdClient {
  const base = getNvdConfig();
  const config: NvdConfig = { ...base, ...options.config };
  const fetchFn = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let lastSuccessAt = 0;

  async function fetchPage(params: NvdQueryParams): Promise<NvdApiResponse> {
    // Courtesy pause between successful requests when no API key
    if (!config.apiKey && lastSuccessAt > 0) {
      const elapsed = Date.now() - lastSuccessAt;
      const pause = config.noKeyPauseMs ?? NVD_NO_KEY_PAUSE_MS;
      if (elapsed < pause) {
        await sleep(pause - elapsed);
      }
    }

    const url = buildUrl(config.baseUrl, {
      resultsPerPage: config.resultsPerPage,
      ...params,
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (config.apiKey) {
      headers.apiKey = config.apiKey;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const res = await fetchFn(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        if (res.status === 429 || res.status === 403) {
          const body = await res.text().catch(() => undefined);
          if (attempt >= config.maxRetries) {
            throw new NvdRateLimitError(
              `NVD rate limited after ${config.maxRetries + 1} attempts (HTTP ${res.status})`,
              res.status,
              body,
            );
          }
          const retryAfterSec = parseRetryAfter(res.headers.get("Retry-After"));
          const delay = computeBackoffMs(attempt, { retryAfterSec, random });
          await sleep(delay);
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => undefined);
          throw new NvdHttpError(
            `NVD HTTP ${res.status}: ${body?.slice(0, 200) ?? res.statusText}`,
            res.status,
            body,
          );
        }

        const json = (await res.json()) as NvdApiResponse;
        lastSuccessAt = Date.now();
        return json;
      } catch (err) {
        if (err instanceof NvdRateLimitError || err instanceof NvdHttpError) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt >= config.maxRetries) break;
        const delay = computeBackoffMs(attempt, { random });
        await sleep(delay);
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new NvdHttpError("NVD request failed", 0);
  }

  return { fetchPage, config };
}
