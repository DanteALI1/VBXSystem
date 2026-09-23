# PROGRESS

## 2026-09-23 00:12 — Волна 3 / Scans findings full verification

### Цель

Scan adapters/jobs, findings UI/status, test:all, screenshots E1–F2, финальная документация.

### Что сделано

- ScannerAdapter: Nmap, Nuclei (+ fixture), Zap/OpenVAS stubs
- Allowlist gate на create scan; reports в `storage/reports/{jobId}/`
- Findings list + status transitions + CVE correlation
- QA: TC-011…017 automated; `test:all` PASS
- Screenshots E1–E4, F1–F2; docs polish
- A1 docker screenshot — blocked (нет docker в среде)

### Как проверял

```bash
npm run typecheck          # 0
npm run lint               # 0
npm run test:unit          # 0 — 30
npm run test:integration   # 0 — 32
npm run test:e2e           # 0 — 10
npm run test:all           # 0
npm run test:screenshots   # 0
npm run smoke:scan         # fixture nmap succeeded
```

### Результат PASS

Gate Wave 3 закрыт. Все TC-001…017 PASS. Открытых P0 нет.

### Скриншоты

A2–F2 captured (кроме A1 blocked). См. `docs/setup-walkthrough/`.

### Тесты

См. [RESULTS.md](../testing/RESULTS.md) Wave 3 / final.

### Риски/TODO (MVP limitations)

- zap/openvas stubs; live nmap/nuclei need binaries
- Allowlist не в seed:assets — создать вручную/`10.0.0.0/8`
- SyncState stuck running → manual reset
- Docker A1 не снят в cloud-agent

### Commit

`feat: scans findings; full docs tests walkthrough`

## 2026-09-22 23:42 — Волна 2 PASS

`feat: nvd/bdu assets allowlist + docs/tests/screens wave2`

## 2026-09-22 23:21 — Волна 1 PASS

`feat: auth shell vulns + docs/tests/screens wave1`

## 2026-09-22 22:55 — Волна 0 PASS

`chore: scaffold vuln-mgmt + docs/testing skeleton`
