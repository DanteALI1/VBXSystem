import type {
  FindingDraft,
  ScanJobContext,
  ScanStartResult,
  ScannerAdapter,
} from "../types";
import { SCANNER_NOT_IMPLEMENTED } from "../types";

/**
 * OpenVAS adapter stub — Wave 3+; not executable.
 */
export class OpenvasAdapter implements ScannerAdapter {
  readonly type = "openvas" as const;

  async start(_job: ScanJobContext): Promise<ScanStartResult> {
    throw Object.assign(new Error("OpenVAS adapter is not implemented"), {
      code: SCANNER_NOT_IMPLEMENTED,
    });
  }

  parse(_report: string, _job: ScanJobContext): FindingDraft[] {
    return [];
  }
}

export const openvasAdapter = new OpenvasAdapter();
