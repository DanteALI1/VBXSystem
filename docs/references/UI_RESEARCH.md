# UI research notes (cvefeed.io / VulnCheck XDB)

Дата: 2026-09-23

## cvefeed.io — что перенимаем

### Общее
- Vulnerability Intelligence positioning: CVE + EPSS + KEV + CWE enrichment
- Тёмная современная поверхность, синие CTA, плотные data views
- Навигация: Dashboard / Search / specialist intel pages (EPSS, CVEQL)

### Login
- Простая centered form Sign In
- Путь к dashboard после auth
- (у нас) добавить 2FA step и RU copy

### Dashboard
- KPI tiles с yesterday baseline и % delta
- «Updated Today» / «Weekly Known Exploited»
- Analytics: CVE Activity chart с диапазонами 1M/6M/1Y
- Counters: CVEs, Affected Products, High-Severity, High-Sev Share
- Highlight cards последних advisory/KEV

### Search
- Заголовок Security Vulnerability Database
- Поиск CVE / Software
- Правые/боковые фильтры
- Date presets: Today, Yesterday, Last 7/30 days, This/Last week
- (у нас) добавить BDU + KEV highlight + has BDU filter

### CVE detail (example CVE-2026-96808)
Поля/блоки:
- Title / id
- Published, Last modified, Status, Source
- CVSS score/severity/version + remotely exploitable
- Description
- CWEs
- Affected products (grouped by vendor/product)
- Solution / mitigations list
- References
- (у нас) + CISA KEV panel + EPSS + **BDU section** + Create Ticket

### CVEQL
- Beta query language UX: editor, examples, operators table, fields table
- Logical ops, dot-path fields, `is_cisa_kev`, EPSS fields
- Rate limits / timeouts
- (у нас) добавить `has_bdu`, `bdu.id`, RU help

### EPSS
- Explanation block
- Top-rated recent predictions (vendor + score + CVSS)
- Top delta movers table (date, CVE, vendor, score, published, delta)

## VulnCheck XDB — что перенимаем
- Отдельный раздел, не смешивать с Search CVE
- Таблица: Date | XDB ID | CVE ID | Repository | Author
- Human+automated curated exploit metadata feel
- (у нас) import/connector, без хостинга payload’ов

## Settings Database mock (наш скрин)
Секции NVD:
1. API ключ + save + NIST link + eye toggle
2. Sync status cards + Start sync / Import / Export
3. DB state grid + auto-update toggle every 2h
Обязательно добавить симметричный **BDU** блок загрузки/статуса.
