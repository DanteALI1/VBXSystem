# Catalog sync (NVD / BDU)

Wave 2 workers keep the vulnerability catalog fresh from upstream feeds.

## NVD

- **API:** CVE 2.0 `GET https://services.nvd.nist.gov/rest/json/cves/2.0`
- **Auth header:** optional `apiKey` from `NVD_API_KEY`
- **Modes:** `incremental` (cursor / lastMod window) and windowed `full` (`NVD_SYNC_DAYS`, default 30)
- **Worker:** BullMQ queue `nvd-sync` → upsert `Vulnerability` + `VulnerabilitySource(nvd)` + `VulnerabilityHistory` + `SyncState`
- **Enqueue:** `POST /api/settings/sync/nvd` (analyst+) returns **202** + `jobId` immediately — HTTP never waits for the sync
- **UI:** Settings → Sync — NVD status + enqueue controls
- **Rate limits:** backoff on HTTP 429/403; without API key, ~6s pause between requests
- **Tests:** Gate uses mocked HTTP over `tests/fixtures/nvd-fragment.json` (TC-005, TC-006) — never the live NIST API

## BDU

BDU XML download/upload and parse are owned by the BDU sync module (separate worker). Placeholder section on the Sync settings page until that lands.

## Related

- [workers.md](../architecture/workers.md)
- [TC-005](../testing/cases/TC-005-nvd-upsert-idempotent.md) / [TC-006](../testing/cases/TC-006-nvd-rate-limit-backoff.md)
- [configuration.md](../setup/configuration.md) — `NVD_*` env vars
