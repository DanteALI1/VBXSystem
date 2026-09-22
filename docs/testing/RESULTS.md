# RESULTS

## Wave 0 — unit smoke

Дата: 2026-09-22 22:55 UTC  
Окружение: cloud-agent (Node v22.14.0, npm 10.9.7)

| Suite | Command | Exit | Result | Evidence / notes |
|-------|---------|------|--------|------------------|
| typecheck | `npm run typecheck` | 0 | PASS | `tsc --noEmit` |
| lint | `npm run lint` | 0 | PASS | `eslint .` |
| unit | `npm run test:unit` | 0 | PASS | 2 files, 14 tests (allowlist 10 + severity 4) |
| integration | `npm run test:integration` | — | N/A | пустой каталог / .gitkeep |
| e2e | `npm run test:e2e` | — | N/A | скелет; Playwright config в Wave 1 |
| screenshots | `npm run test:screenshots` | 0 | STUB | `not implemented` log |

### Сводка

- Wave 0 Gate: **PASS**
- TC drafts: TC-001…017 созданы (`Status: draft`)
- Автоматизация Wave 0: domain unit tests (связанные с TC-011 allowlist matcher)
- См. [WAVE-00-CHECKLIST](../journal/WAVE-00-CHECKLIST.md)
