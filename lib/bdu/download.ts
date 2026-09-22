import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_BDU_XML_URL =
  "https://bdu.fstec.ru/files/documents/vulxml.xml";

export function getBduXmlUrl(): string {
  return process.env.BDU_XML_URL?.trim() || DEFAULT_BDU_XML_URL;
}

export function bduStorageDir(): string {
  return path.join(process.cwd(), "storage", "bdu");
}

export async function downloadBduXml(
  options: {
    url?: string;
    fetchFn?: typeof fetch;
    destPath?: string;
  } = {},
): Promise<{ path: string; bytes: number }> {
  const url = options.url ?? getBduXmlUrl();
  const fetchFn = options.fetchFn ?? fetch;
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`BDU download failed: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const dest =
    options.destPath ??
    path.join(bduStorageDir(), `vulxml-${Date.now()}.xml`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return { path: dest, bytes: buf.length };
}

export async function saveUploadedBduXml(
  content: Buffer | string,
  filename = `upload-${Date.now()}.xml`,
): Promise<string> {
  const dest = path.join(bduStorageDir(), path.basename(filename));
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, content);
  return dest;
}
