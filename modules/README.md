# VBXSystem scanner / enrichment modules

Optional sidecars that talk to Core over the **internal module API**.
Workers authenticate with `VBX_MODULE_TOKEN` (shared) or an optional **per-module token**,
and must only scan allowlisted targets.

## Layout

```
modules/
  _sdk/python/vbx_module_sdk.py   # claim / heartbeat / results + allowlist helpers
  _sdk/finding.v1.schema.json     # finding.v1 JSON Schema
  nmap/                           # port scanner + NSE profiles (profile: nmap)
  shodan/                         # host / DNS / search enrichment (profile: shodan)
  zap/                            # OWASP ZAP baseline|spider|full|api (profile: zap)
  nuclei/                         # ProjectDiscovery nuclei (profile: nuclei)
  gowitness/                      # HTTP(S) screenshots / web recon (profile: gowitness)
  discovery/                      # lightweight host discovery (profile: discovery)
```

## Capability matrix

| Module | Claimed | Implemented | Notes / gaps |
|--------|---------|-------------|--------------|
| **nmap** profiles `quick\|default\|full\|udp\|vuln-scripts` | yes | **yes** | Real `nmap -oX` parse → open ports, services, OS, NSE findings |
| nmap `ports` / `top_ports` / `timing` 0–5 | yes | **yes** | |
| nmap `sv` / `O` / `A` / `scripts` / `exclude` | yes | **yes** | Admin defaults from Core config |
| nmap without binary | degrade | **yes** | TCP connect probe; job `raw.degraded=true` + `scan_degraded` finding. **UDP / vuln-scripts fail** (no silent substitute) |
| **shodan** `host\|search\|dns` | yes | **yes** | Live API + `VBX_SHODAN_MOCK` |
| shodan API key | env or POST | **yes** | `VBX_SHODAN_API_KEY` or `POST /internal/modules/shodan/api-key`; **never** in GET config |
| shodan rich findings | yes | **yes** | host / service / CVE / search match / DNS |
| **zap** `baseline` | `zap-baseline.py` | **yes** | |
| zap `spider` | daemon API | **yes** | Spider + active via `VBX_ZAP_API_URL`. **Fails clearly** if daemon down (no silent baseline) |
| zap `full` | script or daemon | **yes** | Prefers `zap-full-scan.py`, else daemon spider+ascan |
| zap `api` + openapi | yes | **yes** | Prefers `zap-api-scan.py`; else daemon OpenAPI import + spider+ascan |
| zap `ajax_spider` / `max_duration` | yes | **yes** | |
| zap `credential_id` / form auth | yes | **yes** | Vault via SDK; form auth needs daemon API |
| **nuclei** templates / tags | yes | **yes** | Compose profile `nuclei`; mock via `VBX_NUCLEI_MOCK` |
| **gowitness** screenshot | yes | **yes** | Allowlisted HTTP(S); volume `gowitness_data` → `evidence.screenshot_path`; `VBX_GOWITNESS_MOCK` |
| **discovery** hosts | yes | **yes** | CIDR/host list → TCP/DNS probe; mock `VBX_DISCOVERY_MOCK`; hints nmap via `auto_scan_hint` |

### Remaining gaps (honest)

- **nmap UDP** needs privileges / proper nmap image capabilities in some environments (container may lack `NET_RAW`).
- **ZAP form auth** is best-effort against real login forms; field names / CSRF may need manual ZAP context tuning.
- **ZAP ajax spider** depends on ZAP add-on availability in the image.
- **Shodan search** credits / plan limits are not enforced beyond the admin rate-limit hint.
- **gowitness** needs Chromium in the image; screenshots live on shared volume `gowitness_data` (API `/app/artifacts/gowitness`) and are served via `artifact_key` (no S3 yet).
- Workers do not auto-scale; one Compose replica per module profile.

## Auth & secrets

| Mechanism | How |
|-----------|-----|
| Shared token | Env `VBX_MODULE_TOKEN` → header `X-Module-Token` |
| Per-module token | Settings UI / DB `module_tokens_enc`, or `VBX_MODULE_TOKEN_<ID>` |
| Scope header | SDK sends `X-Module-Id`; Core rejects a per-module token used for another module |
| Secret injection | `VBX_SECRET__NAME` or `VBX_SECRET_FILE__NAME` |

**Shodan API key is not returned by `GET /internal/modules/config`.** Prefer:

1. Docker/env secret `VBX_SHODAN_API_KEY` on the shodan worker, or
2. `POST /internal/modules/shodan/api-key` (shodan-scoped token only) — key cached in worker memory.

Rate limit on internal module endpoints: **120 req/min** per token fingerprint + IP (Redis; fail-open if Redis down). Override with `VBX_MODULE_RATE_LIMIT`.

## Core API contract

| Path | Who | Purpose |
|------|-----|---------|
| `POST /modules/{module_id}/jobs` | operator (`scan:run`) | enqueue `{ "params": { … } }` |
| `GET  /modules/jobs` | operator (`scan:read`) | list jobs |
| `GET  /modules/jobs/{id}` | operator | job status |
| `GET  /modules` | operator | registered modules + online |
| `GET  /findings` | operator (`scan:read`) | ingested findings |
| `GET  /findings/{id}` | operator (`scan:read`) | finding detail + full evidence |
| `GET  /findings/{id}/artifacts/{key}` | operator (`scan:read`) | stream evidence file (path-safe) |
| `GET  /artifacts/{key}` | operator (`scan:read`) | stream under `VBX_ARTIFACTS_DIR` |
| `GET/PUT /settings/modules` | admin (`scan:admin`) | allowlist, disable, module defaults, optional tokens |
| `POST /internal/modules/register` | worker | announce module |
| `GET  /internal/modules/config` | worker | runtime allowlist / defaults (**no plaintext secrets**) |
| `POST /internal/modules/shodan/api-key` | shodan worker | fetch Shodan key once |
| `GET  /internal/modules/credentials/{id}` | worker | vault credential (plaintext password once) |
| `POST /internal/modules/jobs/claim` | worker | claim next job |
| `POST /internal/modules/jobs/{id}/heartbeat` | worker | progress |
| `POST /internal/modules/jobs/{id}/results` | worker | findings batch + status |

## Job params (per module)

### nmap

```json
{
  "target": "scan-target",
  "profile": "quick|default|full|udp|vuln-scripts",
  "ports": "22,80,443",
  "top_ports": "100",
  "timing": 3,
  "service_detection": true,
  "os_detection": false,
  "aggressive": false,
  "scripts": "vuln,safe",
  "exclude": "10.0.0.1"
}
```

XML (`-oX`) is parsed into open ports, services, OS guesses, and NSE script findings.
Admin defaults: Settings → Modules (`nmap_default_*`) → worker `GET /internal/modules/config`.

**Fallback:** if `nmap` is missing, `default`/`quick`/`full` degrade to a Python TCP connect probe (`raw.degraded`, `fallback=python_tcp_probe`). `udp` and `vuln-scripts` **fail** the job with an explicit error.

### shodan

```json
{ "mode": "host", "target": "8.8.8.8" }
{ "mode": "dns", "query": "dns.google,example.com" }
{ "mode": "search", "query": "port:443 org:\"Example\"" }
```

Admin can disable modes and set a rate-limit hint (req/s). Search matches are filtered by allowlist.

### zap

```json
{
  "target": "http://scan-target",
  "scan_type": "baseline|spider|full|api",
  "ajax_spider": false,
  "max_duration": 300,
  "credential_id": 1,
  "login_url": "http://scan-target/login",
  "username_field": "username",
  "password_field": "password",
  "context_name": "",
  "context_user": "",
  "openapi": "https://…/openapi.json"
}
```

| scan_type | Execution path |
|-----------|----------------|
| `baseline` | `zap-baseline.py` |
| `spider` | ZAP daemon API only (`VBX_ZAP_API_URL`) — spider (+ ajax) + active scan. **No silent baseline fallback.** |
| `full` | `zap-full-scan.py` if present, else daemon spider + active |
| `api` | `zap-api-scan.py -f openapi` if present, else daemon OpenAPI import + spider + active |

Compose profile starts a local daemon via `modules/zap/entrypoint.sh` (`VBX_ZAP_START_DAEMON=true`). Set `VBX_ZAP_MOCK=true` only for fixture tests.

### nuclei

```json
{
  "target": "http://scan-target",
  "templates": "/root/nuclei-templates",
  "tags": "cve,misconfig",
  "exclude_tags": "dos,fuzz",
  "severity": "critical,high,medium",
  "rate_limit": 150,
  "concurrency": 25
}
```

- `templates` — filesystem path(s) for `-t`, **or** comma-separated tags when the value is not path-like.
- `tags` / `exclude_tags` / `severity` — nuclei filters.
- Admin defaults: `nuclei_default_templates`, `nuclei_rate_limit` (also env `VBX_NUCLEI_TEMPLATES`, `VBX_NUCLEI_RATE_LIMIT`).
- Missing binary → job fails clearly, unless `VBX_NUCLEI_MOCK=true`.
- JSONL (`-jsonl`) → findings with template-id, name, severity, matched-at, extracted results.

### gowitness

```json
{
  "target": "http://scan-target",
  "timeout": 60,
  "resolution": "1440x900",
  "fullpage": false
}
```

- Screenshots are written under `VBX_GOWITNESS_DATA_DIR` (Compose volume `gowitness_data` → `/data` on the worker).
- The **API** mounts the same volume at `/app/artifacts/gowitness` (`VBX_ARTIFACTS_DIR` default `/app/artifacts`).
- On ingest, Core copies the file into `artifacts/{module_id}/{job_id}/{safe_name}` and sets `evidence.artifact_key` (plus keeps small `thumbnail_b64` for list previews). `evidence.module` = `gowitness`.
- Serve: `GET /findings/{id}`, `GET /findings/{id}/artifacts/{artifact_key}`, `GET /artifacts/{key}` (`scan:read`).
- Allowlist mandatory. Mock: `VBX_GOWITNESS_MOCK=true` (tiny PNG, no Chromium).

### discovery

```json
{
  "targets": "10.0.0.0/24,scan-target",
  "ports": "22,80,443",
  "connect_timeout": 1.0,
  "max_hosts": 256
}
```

- Expands CIDRs (capped by `max_hosts` / `VBX_DISCOVERY_MAX_HOSTS`) and probes with lightweight TCP connect; hostnames may be reported via DNS alone.
- Findings: `discovered_host` / severity `info` / title `Discovered host {ip}` with evidence `hostname` / `ip` / `ports`.
- On success, `progress_json.raw.auto_scan_hint` = `{ "module_id": "nmap", "reason": "discovery" }` (follow-up scan hint).
- Mock: `VBX_DISCOVERY_MOCK=true` returns canned hosts (no network).

## Profiles (Compose)

```bash
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile nmap up -d --build
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile shodan up -d --build
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile zap up -d --build
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile nuclei up -d --build
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile gowitness up -d --build
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile discovery up -d --build
```

After pulling artifact-storage changes, rebuild **api** (volume mounts) and the scanner:

```bash
docker compose -f docker-compose.yml -f docker-compose.scanners.yml --profile gowitness up -d --build api scanner-gowitness web
```

Shared env: `VBX_MODULE_TOKEN`, `VBX_SCAN_ALLOWLIST`, `VBX_API_INTERNAL_URL`.
Shodan: set `VBX_SHODAN_API_KEY` on the worker (preferred) or store encrypted in Core for POST fetch.
ZAP: `VBX_ZAP_API_URL` (default `http://127.0.0.1:8080` inside the zap container).
gowitness: screenshots on volume `gowitness_data` (API + worker); optional `VBX_GOWITNESS_MOCK=true`.
nuclei: optional `nuclei_data` volume shared at API `/app/artifacts/nuclei`.
discovery: optional `VBX_DISCOVERY_MOCK=true` for canned hosts; real mode is TCP/DNS only (no aggressive scan).

## Safety

- Targets outside `VBX_SCAN_ALLOWLIST` → job `failed` (and enqueue rejected when Core allowlist is set).
- Do not widen the allowlist to the public Internet without intent.
- ZAP `full` / API active scan can be intrusive — keep targets in-scope.
- Nuclei templates can be intrusive (especially CVE/exploit tags) — keep targets in-scope.
- Core does not ship Shodan key over the config GET wire.

## Unit tests (no Docker)

```bash
cd modules/nmap && python -m pytest test_worker.py -q
cd modules/shodan && python -m pytest test_worker.py -q
cd modules/zap && python -m pytest test_worker.py -q
cd modules/nuclei && python -m pytest test_worker.py -q
cd modules/gowitness && python -m pytest test_worker.py -q
cd modules/discovery && python -m pytest test_worker.py -q
cd apps/api && python -m pytest tests/test_modules.py tests/test_artifacts.py -q
```
