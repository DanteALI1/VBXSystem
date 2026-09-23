import { DEFAULT_BDU_XML_URL } from "./types";

export class BduDownloadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BduDownloadError";
  }
}

export type DownloadBduOptions = {
  url?: string;
  /** Injectable fetch for tests — never hit real BDU_XML_URL in CI */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function resolveBduXmlUrl(override?: string): string {
  return (
    override?.trim() ||
    process.env.BDU_XML_URL?.trim() ||
    process.env.BDU_FEED_URL?.trim() ||
    DEFAULT_BDU_XML_URL
  );
}

/**
 * Download БДУ vulxml. Callers/tests MUST inject `fetchImpl` or mock
 * global fetch — do not hit the real ФСТЭК URL in automated tests.
 */
export async function downloadBduXml(
  options: DownloadBduOptions = {},
): Promise<{ xml: string; buffer: Buffer; url: string }> {
  const url = resolveBduXmlUrl(options.url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? Number(process.env.BDU_REQUEST_TIMEOUT_MS ?? 60_000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/xml,text/xml,*/*" },
    });
    if (!res.ok) {
      throw new BduDownloadError(
        `BDU download failed: HTTP ${res.status}`,
        res.status,
      );
    }
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    return { xml: buffer.toString("utf8"), buffer, url };
  } catch (err) {
    if (err instanceof BduDownloadError) throw err;
    throw new BduDownloadError(
      `BDU download failed: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      err,
    );
  } finally {
    clearTimeout(timer);
  }
}
