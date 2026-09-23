# WAVE-00 CHECKLIST — Foundation gate

## Документация

- [x] `docs/README.md` — оглавление со ссылками
- [x] `docs/architecture/overview.md` — mermaid + OpenCVE UX taken/not
- [x] `docs/architecture/data-model.md` — полный домен + индексы (aligned to schema)
- [x] `docs/architecture/workers.md` — NVD/BDU/Scan, BullMQ
- [x] `docs/setup/install.md`
- [x] `docs/setup/configuration.md` — env контракт
- [x] `docs/setup/bootstrap-admin.md`
- [x] `docs/setup-walkthrough/README.md` — A1–F2 + C5
- [x] `docs/setup-walkthrough/images/.gitkeep` + A1 PNG
- [x] `docs/features/vulnerabilities.md` — advanced search + ADVANCED_SEARCH_MAX_FIELDS
- [x] `docs/features/assets.md`
- [x] `docs/features/scans.md` — allowlist-only, detect-only nuclei, no auto-exploitation
- [x] `docs/features/findings.md`
- [x] `docs/features/auth-roles.md`
- [x] `docs/api/overview.md`
- [x] `docs/ops/runbook.md`
- [x] `docs/ops/troubleshooting.md`

## ADR

- [x] ADR-001 stack
- [x] ADR-002 auth (Better Auth, LDAP/OIDC задел)
- [x] ADR-003 scan adapters
- [x] ADR-004 OpenCVE UX + **license conclusion (BSL 1.1, no code/brand clone)**

## Journal / Testing

- [x] `docs/journal/PROGRESS.md` — Wave 0 PASS
- [x] `docs/journal/WAVE-01-CHECKLIST.md` template
- [x] `docs/journal/WAVE-02-CHECKLIST.md` template
- [x] `docs/journal/WAVE-03-CHECKLIST.md` template
- [x] `docs/testing/README.md`
- [x] `docs/testing/TESTPLAN.md`
- [x] `docs/testing/RESULTS.md` — Wave 0 unit run
- [x] TC-001 … TC-020 draft files exist

## Code / Gate

- [x] код соответствует доменным контрактам (schema + helpers)
- [x] UI каталога — scaffold only (Wave 1)
- [x] typecheck PASS
- [x] lint PASS
- [x] релевантные unit PASS (severity, allowlist, search)
- [x] docs волны обновлены
- [x] TC status/last run обновлены (TC-020 automated)
- [x] RESULTS.md дополнен
- [x] скрины волны: A1
- [x] PROGRESS.md = PASS
- [x] нет открытых P0
- [ ] commit + push (orchestrator next)

## Gate decision

- [x] Docs/QA foundation + scaffold accepted
- [x] Result записан в `PROGRESS.md` — **PASS**
