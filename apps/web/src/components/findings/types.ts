/** Shared finding shape from GET /findings (includes evidence). */
export type Finding = {
  id: number;
  title: string;
  severity?: string | null;
  status?: string | null;
  module_id?: string | null;
  scan_job_id?: number | null;
  ticket_id?: number | null;
  asset_id?: number | null;
  asset_hostname?: string | null;
  asset_ip?: string | null;
  asset_label?: string | null;
  linked_cve_ids?: string[] | null;
  linked_bdu_ids?: string[] | null;
  fingerprint?: string | null;
  occurrence_count?: number | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  evidence?: Record<string, unknown> | null;
  raw_ref?: string | null;
};
