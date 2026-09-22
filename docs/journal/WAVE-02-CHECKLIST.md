# WAVE-02 — Gate checklist

## Gate

- [x] код соответствует доменным контрактам (NVD/BDU sync, assets, allowlist)
- [x] typecheck PASS
- [x] lint PASS
- [x] unit PASS (20) — TC-005/006/007
- [x] integration PASS (23) — TC-002/008/009/010/015
- [x] e2e regression PASS (TC-001/003/004)
- [x] UI проверен (sync, assets, allowlist + screenshots)
- [x] docs волны обновлены
- [x] TC status/last run обновлены
- [x] RESULTS.md дополнен
- [x] скрины B3,C1,C2,D1,D2,D3 на месте
- [x] PROGRESS.md = PASS
- [x] commit + push
- [x] нет открытых P0

## Notes

- Client-bundle fix: assets/allowlist UI import types/schemas directly (not barrel with db).
- NVD `force` flag accepted but only BDU hash-skip uses it (documented).
- A1 docker screenshot still blocked (no docker binary).
