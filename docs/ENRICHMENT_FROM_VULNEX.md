# VBXSystem ← VULNEX: план обогащения

> Инструкции оркестратору. Методология — та же, что в `MASTER_PROMPT.md` / `AGENT_LAUNCH.md`:  
> **одна волна = один субагент = узкий scope = DoD + STATUS**.  
> Источник идей: репозиторий [DanteALI1/VULNEX](https://github.com/DanteALI1/VULNEX) (продукт VULNDB).  
> Стилистика VBX **не меняется** на NovaTIP: остаёмся на cvefeed-dark + бренд VBX + RU UI.

Дата анализа: 2026-09-24.

---

## 0. Что изучено в VULNEX

| Область | VULNEX (VULNDB) | VBXSystem сейчас | Решение |
|---------|-----------------|------------------|---------|
| Стек | Django + HTMX + Celery | Next + FastAPI + Redis worker | **Не портировать стек** |
| UI kit | NovaTIP / tip-console | cvefeed-inspired dark | Паттерны UX, не CSS-клон |
| Каталог | Единая `Vulnerability` (CVE/BDU/LOCAL) | CVE + standalone BDU | Добавить **LOCAL ID** |
| Карточка | Вкладки NVD/BDU, CVSS 3.1/3.0/2/4, поля БДУ | Scoring Details + секция BDU | Вкладки описаний + поля БДУ |
| Login | Wide split: visual + form + SSO | Центрированная карточка | Wide split + брендинг |
| Setup | Wizard `/setup/` | Seed admin из env | Волна W10 wizard (опционально) |
| Branding | logo, org, login_title/text | Только env admin org | Settings → Брендинг |
| Sync | NVD + KEV + BDU URL (xlsx) | NVD API + BDU upload | + BDU URL auto-sync |
| System | CPU/RAM/SWAP/Disk | Нет | Settings → Система |
| Notify | Email + Telegram | SMTP + in-app | + Telegram (W11) |
| Tickets | SLA + confirm close | Workflow без SLA | SLA fields (W11) |
| License | `.novalic` / heartbeat | Нет | **Не переносить** |
| Wiki | Запрещена | Нет | Ок |

---

## 1. Принципы (из MASTER_PROMPT — не нарушать)

1. Не торопись: spec → API → UI → тесты → STATUS.
2. Одна волна = один PR / один субагент.
3. Не ломать `VBX_*` env и `deploy/redos/install.sh`.
4. Не копировать proprietary ассеты cvefeed / NovaTIP — только UX-паттерны.
5. Русский UI, RBAC на endpoints, audit на admin-действиях.
6. Лицензирование и vendor lock-in из VULNEX **out of scope навсегда**.

---

## 2. Волны обогащения

| ID | Файл | Scope | Зависит |
|----|------|-------|---------|
| **W9** | `docs/agents/W9_vulnex_ui_ops.md` | Login split, branding, system metrics, NVD/BDU tabs, BDU URL setting, local IDs MVP | W0–W8 |
| **W10** | `docs/agents/W10_setup_wizard.md` | First-run wizard (org/branding/DB/sources), без лицензии | W9 |
| **W11** | `docs/agents/W11_notify_sla.md` | Telegram notify, ticket SLA, confirm-close | W9, W7 |

Порядок: `W9 → (W10 ∥ W11)`.

---

## 3. Стартовый промпт оркестратору (копировать)

```
Ты оркестратор обогащения VBXSystem из VULNEX.
1) Прочитай docs/MASTER_PROMPT.md, docs/ENRICHMENT_FROM_VULNEX.md, docs/STATUS.md.
2) Запускай только следующую незакрытую волну W9/W10/W11 по docs/agents/Wn_*.md.
3) UI: cvefeed dark, бренд VBX, русский. Не портируй Django/NovaTIP/лицензии.
4) Референс идей: github.com/DanteALI1/VULNEX (VULNDB), не копируй код слепо.
5) После DoD: тесты, свежие docs/screenshots/*, обновление README галереи и STATUS.md.
6) Compose должен подниматься; /health и /ready — ok.
```

---

## 4. Acceptance обогащения (суммарно)

- [x] Login: двухколоночный layout (visual + form), бренд из settings
- [x] Settings → Брендинг (product name, org, login title/text)
- [x] Settings → Система (CPU/RAM/SWAP/Disk)
- [x] Local vuln IDs `VBX-YYYY-NNNN` + создание + поиск
- [x] CVE detail: вкладки описания NVD | БДУ; расширенные поля БДУ
- [x] Settings → База данных: URL БДУ + кнопка sync по URL
- [ ] (W10) Wizard первого запуска без license server
- [ ] (W11) Telegram + SLA заявок
- [x] Скриншоты всех затронутых страниц обновлены в README
