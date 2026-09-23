# W3 — Search & Vulnerability Detail Agent Prompt

## Mission
Реализовать Search (CVE + BDU) с подсветкой CISA KEV и детальные карточки CVE/BDU в стилистике cvefeed.

## Depends on
W2 (data must exist; seed fixtures for demos/tests).

## Read first
- https://cvefeed.io/search/
- https://cvefeed.io/vuln/detail/CVE-2026-96808
- `docs/PRODUCT_SPEC.md` §5.3–5.5

## Deliverables
### Search `/search`
- Query + filters (severity, KEV, has BDU, date presets)
- Mixed results: CVE rows + standalone BDU rows
- Badges: severity, **KEV** (accent highlight), **BDU**, EPSS
- Sort + pagination
- Empty/loading/error states

### CVE detail `/vuln/[cveId]`
Секции как у cvefeed + блок **БДУ**:
Header, CVSS, Description, CWE, Affected products, KEV, EPSS, BDU panel, Solution, References, Create Ticket button (может вести на stub до W7)

### BDU detail `/bdu/[bduId]`
Полная карточка standalone/enrichment view

### API
- `GET /search`
- `GET /vuln/{cve_id}`
- `GET /bdu/{bdu_id}`

## Out of scope
CVEQL language (W4), XDB (W5), full tickets (W7).

## DoD
- [ ] Поиск находит и CVE, и BDU id/текст
- [ ] KEV строки визуально отличаются
- [ ] CVE с линком BDU показывает русскую секцию
- [ ] Playwright smoke: search → open detail
- [ ] STATUS.md updated

## Quality bar
Indexed queries; no N+1; accessible badges (not color-only).
