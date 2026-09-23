# WAVE-01 CHECKLIST — Auth + Shell + OpenCVE-like vulns

## Функциональность

- [x] Better Auth login + bootstrap admin
- [x] Middleware protects `/app/**`
- [x] App shell left nav (Dashboard…Settings)
- [x] Dashboard KPIs + recent updates (summary API)
- [x] Vulns list: columns, facets, advanced query, query builder, saved views
- [x] Vulns detail: OpenCVE-like sections
- [x] Tags + saved views API
- [x] Seed fixtures (CVE↔BDU + samples)

## Gate

- [x] код соответствует доменным контрактам
- [x] UI каталога соответствует OpenCVE UX-чеклисту (list columns + detail sections)
- [x] typecheck PASS
- [x] lint PASS
- [x] unit PASS (16)
- [x] e2e login + vulns PASS (7)
- [x] UI проверен (screenshots)
- [x] docs волны обновлены
- [x] TC status/last run обновлены
- [x] RESULTS.md дополнен
- [x] скрины: A2,B1,B2,C3,C4,C5,F2
- [x] PROGRESS.md = PASS
- [ ] commit + push (next)
- [x] нет открытых P0
