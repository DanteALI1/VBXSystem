import type { ScanType, ScannerAdapter } from "./types";
import { nmapAdapter } from "./adapters/nmap";
import { nucleiAdapter } from "./adapters/nuclei";
import { zapAdapter } from "./adapters/zap";
import { openvasAdapter } from "./adapters/openvas";

const ADAPTERS: Record<ScanType, ScannerAdapter> = {
  nmap: nmapAdapter,
  nuclei: nucleiAdapter,
  zap: zapAdapter,
  openvas: openvasAdapter,
};

export function getAdapter(type: ScanType): ScannerAdapter {
  const adapter = ADAPTERS[type];
  if (!adapter) {
    throw new Error(`Unknown scan type: ${type}`);
  }
  return adapter;
}

export { nmapAdapter, nucleiAdapter, zapAdapter, openvasAdapter };
