import type { ScanType } from "@/db/schema";
import { NmapAdapter } from "./nmap";
import { NucleiAdapter } from "./nuclei";
import { OpenvasAdapter } from "./openvas";
import { ZapAdapter } from "./zap";
import type { ScannerAdapter } from "./types";

const adapters: Record<ScanType, ScannerAdapter> = {
  nmap: new NmapAdapter(),
  nuclei: new NucleiAdapter(),
  zap: new ZapAdapter(),
  openvas: new OpenvasAdapter(),
};

export function getScannerAdapter(type: ScanType): ScannerAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`No scanner adapter registered for type=${type}`);
  }
  return adapter;
}

export function listScannerTypes(): ScanType[] {
  return Object.keys(adapters) as ScanType[];
}
