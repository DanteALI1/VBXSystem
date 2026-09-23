# WAVE-03 — Gate checklist

## Gate

- [x] код соответствует доменным контрактам (scans, findings, adapters)
- [x] typecheck PASS
- [x] lint PASS
- [x] unit PASS (30) — TC-011/012/013 + prior
- [x] integration PASS (32) — TC-014/016 + prior
- [x] e2e PASS (10) — TC-001/003/004/016/017
- [x] `npm run test:all` PASS
- [x] `npm run test:screenshots` PASS — E1–E4, F1–F2
- [x] UI проверен (scans, findings, dashboard)
- [x] docs волны обновлены (final polish)
- [x] TC-001…017 status/last run обновлены
- [x] RESULTS.md Wave 3 + final
- [x] скрины E1–E4, F1–F2 на месте (A1 blocked — no docker)
- [x] PROGRESS.md = PASS
- [x] commit + push
- [x] нет открытых P0

## Notes

- A1 `01-docker-up.png` blocked in cloud-agent (no docker binary); compose files present for on-prem.
- zap/openvas stubs only; nmap/nuclei fixture fallback when binaries missing.
