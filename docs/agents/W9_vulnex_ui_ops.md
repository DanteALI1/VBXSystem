# W9 — VULNEX UI & Ops enrichment

## Goal
Перенести **полезные UX/ops-паттерны** из VULNEX (VULNDB) в VBXSystem, сохраняя cvefeed-стилистику и контракты W0–W8.

## Must read
- `docs/MASTER_PROMPT.md`
- `docs/ENRICHMENT_FROM_VULNEX.md`
- `docs/PRODUCT_SPEC.md` (IA, settings)
- VULNEX reference (локально или GitHub): login split, settings system metrics, local IDs, vuln detail NVD/BDU tabs, BDU URL sync

## In scope
1. **Login wide layout** — слева brand/visual (без копирования cyber-ассетов 1:1), справа форма + 2FA; тексты из branding settings.
2. **Public branding API** `GET /branding` (без auth) + `GET/PUT /settings/branding` (admin).
3. **Settings → Брендинг**: product_name, organization_name, login_title, login_text, local_id_prefix.
4. **Settings → Система**: live CPU/RAM/SWAP/Disk (psutil внутри API container).
5. **Local vulns**: таблица/модель, sequence `PREFIX-YYYY-NNNN`, create UI, появление в Search.
6. **CVE detail**: вкладки описания NVD | БДУ; блок полей БДУ (vendor/software/versions/status/exploit) как в VULNEX.
7. **Database settings**: поле `bdu_xlsx_url` / `bdu_xml_url` + кнопка «Синхронизировать по URL» (httpx download → существующий import).
8. Обновить `docs/STATUS.md`, скриншоты login/settings/system/cve/search, README галерею.

## Out of scope
- Setup wizard (W10)
- Telegram / ticket SLA (W11)
- License server / `.novalic`
- Переписывание на Django / NovaTIP CSS
- Ломать `VBX_*` env

## DoD checklist
- [ ] Compose up; `/health` + `/ready` ok
- [ ] Login split + branding влияет на login copy
- [ ] System metrics endpoint + UI
- [ ] Создаётся LOCAL id, виден в Search
- [ ] CVE detail NVD/BDU tabs
- [ ] BDU URL sync работает (хотя бы XML)
- [ ] pytest зелёный на затронутых тестах
- [ ] Скриншоты обновлены
