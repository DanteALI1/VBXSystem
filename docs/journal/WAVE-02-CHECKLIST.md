# WAVE-02 CHECKLIST — (template)

> Заполнить цели волны перед стартом. Все пункты unchecked.

## Goals

- [ ] _(определить)_
- [ ] _(определить)_

## Implementation

- [x] NVD sync worker + idempotent upsert
- [x] NVD rate-limit backoff
- [ ] BDU XML parse + CVE link
- [ ] BDU upload fallback
- [x] Sync settings enqueue (UI/API) — NVD path (`/api/settings/sync/nvd`)
- [ ] Tags + saved views
- [ ] Dashboard counters

## Tests

- [x] TC-005
- [x] TC-006
- [ ] TC-007
- [ ] TC-008
- [ ] TC-015
- [ ] TC-016
- [ ] TC-018
- [ ] TC-019

## Docs

- [ ] Walkthrough кадры F1 и связанные — статус PNG
- [ ] PROGRESS.md Wave 2

## Gate

- [ ] Workers устойчивы на lab feed
- [ ] Orchestrator Result
