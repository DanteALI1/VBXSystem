import type {
  FindingDraft,
  ScanJobContext,
  ScanStartResult,
  ScannerAdapter,
} from "../types";
import { SCANNER_NOT_IMPLEMENTED } from "../types";

/**
 * ZAP adapter stub — Wave 3+; not executable.
 * Presence allows ScanJob type=zap to be rejected with a clear code.
 */
export class ZapAdapter implements ScannerAdapter {
  readonly type = "zap" as const;

  async start(_job: ScanJobContext): Promise<ScanStartResult> {
    throw Object.assign(new Error("ZAP adapter is not implemented"), {
      code: SCANNER_NOT_IMPLEMENTED,
    });
  }

  parse(_report: string, _job: ScanJobContext): FindingDraft[] {
    return [];
  }
}

export const zapAdapter = new ZapAdapter();
