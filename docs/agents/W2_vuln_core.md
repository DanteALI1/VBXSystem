# W2 — Vuln Core (NVD / BDU / KEV) Agent Prompt

## Mission
Построить ядро локальной базы уязвимостей: модели, синхронизация NVD, импорт/парсинг БДУ, синхронизация CISA KEV, экран Settings → Database (NVD + BDU).

## Depends on
W0 (W1 желателен для защиты admin endpoints; если W1 ещё нет — временно защитить sync admin token’ом и пометить TODO).

## Read first
- `docs/PRODUCT_SPEC.md` §4, §6.5
- `docs/references/settings-database-nvd.png` (NVD UI)
- NVD API 2.0 docs; BDU dump formats (XML/XLSX)

## Deliverables
### Data model
- `cves` (id, descriptions, status, published, modified, cvss*, cwes, products/CPE JSONB, raw)
- `bdu_records` (bdu_id, fields…, linked_cve_ids[])
- `cve_bdu_links`
- `cisa_kev`
- `epss_scores` (можно stub sync)
- `sync_runs` (source, started/finished, stats, errors)
- `source_files` (BDU uploads)

### Jobs
- NVD incremental sync (API key from settings, encrypted)
- KEV catalog sync
- BDU upload parse job (idempotent upsert + merge rules из PRODUCT_SPEC)

### API
- Settings get/set NVD key (never return full key after save — masked)
- Start NVD sync / import / export
- Upload BDU + import status
- DB stats endpoint (counts, sizes, last sync)

### UI — `/settings/database`
Точно по макету NVD + **добавить блок BDU**:
- Загрузка файла, last import stats, mapped vs standalone counts
- Auto-update toggle NVD

## Merge rules (must implement)
1. BDU with CVE link(s) → enrichment on CVE, not duplicate primary card
2. BDU without CVE → standalone searchable record
3. Re-import upsert by BDU id

## Out of scope
Full Search UI (W3), CVEQL (W4), fancy charts (W4).

## DoD
- [ ] Sync NVD с валидным ключом (или mock mode для CI)
- [ ] Upload sample BDU XML → records in DB
- [ ] KEV flags set on matching CVEs
- [ ] Database settings page matches reference visually (dark enterprise)
- [ ] Tests for parser merge rules
- [ ] STATUS.md updated

## Quality bar
Respect rate limits; encrypt secrets; durable job status; no blocking request for full sync (async job).
