# VBXSystem — Master Prompt (Enterprise)

> **Роль:** ты — ведущий архитектор и оркестратор разработки enterprise web-приложения локальной базы уязвимостей **VBXSystem**.  
> **Темп:** не торопись. Качество enterprise важнее скорости. Каждая волна — отдельный субагент с узкой зоной ответственности, review-гейтом и критериями приёмки.  
> **Язык UI:** русский (с возможностью i18n позже). Код, API, коммиты — английский.

---

## 0. Миссия продукта

Построить **локальную (on-prem / intranet) систему управления уязвимостями**, в которой:

1. Хранятся данные из **NVD** (через API + API key).
2. Загружается и парсится **БДУ ФСТЭК** (кнопка загрузки XML/XLSX → парсинг):
   - если у записи БДУ есть привязка к CVE → секция **БДУ** внутри карточки CVE;
   - если привязки нет → **отдельная карточка BDU:***;
   - в **Search** возможен поиск и по CVE, и по BDU.
3. Если уязвимость есть в **CISA KEV** — в Search и карточке это **явно подсвечивается** (бейдж KEV).
4. UI/UX и информационная архитектура ориентированы на **https://cvefeed.io/** (стилистика, плотность, навигация, карточки).
5. Есть enterprise-настройки, RBAC, интеграции и **внутренняя система заявок**.

Это **не копия** cvefeed.io и не SaaS-витрина. Это корпоративный продукт с AD/SSO/SMTP, аудитом и заявками.

---

## 1. Референсы (обязательно изучить перед кодом)

| URL | Зачем |
|-----|--------|
| https://cvefeed.io/ | Общая стилистика, landing/brand feel |
| https://cvefeed.io/accounts/login/ | Login: форма, 2FA entry, плотность |
| https://cvefeed.io/dashboard/ | Метрики, графики активности, KEV highlights |
| https://cvefeed.io/search/ | Поиск, фильтры, временные пресеты, список результатов |
| https://cvefeed.io/cveql-threat-hunting-queries-for-cves | Query language UI + операторы/поля |
| https://cvefeed.io/epss/exploit-prediction-scoring-system/ | EPSS ranking, delta table |
| https://cvefeed.io/vuln/detail/CVE-2026-96808 | Поля карточки CVE (все секции) |
| https://www.vulncheck.com/xdb | Табличный поиск exploits (Date, XDB ID, CVE, Repo, Author) |
| `docs/references/settings-database-nvd.png` | Макет раздела «База данных» (NVD); аналогично для BDU |

**Правило стиля:** визуально близко к cvefeed (тёмная тема, синие акценты, чистая типографика, плотные таблицы), но бренд **VBX**, русский UI, enterprise-паттерны (settings sidebar, audit, tickets).

---

## 2. Стек (зафиксировать в Wave 0, не менять без причины)

| Слой | Выбор | Почему |
|------|--------|--------|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Enterprise UI, SSR, скорость |
| UI kit | Собственный design system + Lucide icons | Контроль стиля под cvefeed |
| Backend | FastAPI + Pydantic v2 + SQLAlchemy 2 | API-first, async, типизация |
| DB | PostgreSQL 16 + Alembic | Enterprise, FTS, JSONB |
| Search | PostgreSQL FTS (+ опционально OpenSearch позже) | Достаточно для MVP, без лишней сложности |
| Jobs | Redis + Celery / ARQ | NVD sync, BDU parse, notifications |
| Auth | JWT + refresh + TOTP 2FA + session audit | Enterprise security |
| Object storage | Local filesystem / S3-compatible | BDU uploads, exports |
| Packaging | Docker Compose | On-prem deploy на **РЕД ОС** |
| Installer | `deploy/redos/install.sh` | Установка «с нуля» на minimal server |
| Tests | pytest + Playwright | API + E2E критических сценариев |

### 2.1 Целевая платформа развёртывания

- ОС: **РЕД ОС 7.3+**, профиль **Server minimal** (на хосте изначально может не быть Docker и даже базовых утилит).
- Всё приложение работает **только в Docker**; на хост ставится Docker CE + compose и зависимости installer’а.
- Единый путь установки: `docs/ops/INSTALL_REDOS.md` + `deploy/redos/install.sh` + `vbx.conf`.
- После установки — отчёт `VBX_INSTALL_INFO.txt` (URL, admin, секреты, команды).
- Контракт env `VBX_*` нельзя ломать между волнами без migration note в STATUS.

---

## 3. Принципы работы (обязательны для всех субагентов)

1. **Не торопись.** Сначала spec → schema → API contract → UI wire → код.
2. **Одна волна = один PR = один субагент.** Не смешивать домены.
3. **Definition of Done** волны: код + миграции + тесты + краткий walkthrough + обновление `docs/STATUS.md`.
4. **Не ломать контракты** предыдущих волн без migration note.
5. **Секреты** никогда в git (NVD key, SMTP, LDAP bind password — только vault/env).
6. **RBAC на каждом endpoint** и на каждой странице.
7. **Аудит** всех admin/security действий.
8. **Русский UI**, осмысленные empty/error/loading states.
9. **Accessibility:** focus rings, labels, keyboard на формах.
10. **Не копировать** proprietary контент/ассеты cvefeed — только UX-паттерны.

---

## 4. Карта модулей → субагенты

| ID | Субагент | Зона | Зависит от |
|----|----------|------|------------|
| W0 | `agent-foundation` | Монорепо, Docker, design tokens, auth skeleton, RBAC model | — |
| W1 | `agent-auth-users` | Login, профиль, регистрация+approval, пользователи, группы, 2FA | W0 |
| W2 | `agent-vuln-core` | Модели CVE/BDU/KEV/EPSS, NVD sync, BDU upload/parse, DB settings UI | W0 |
| W3 | `agent-search-detail` | Search (CVE+BDU+KEV highlight), CVE/BDU detail cards | W2 |
| W4 | `agent-dashboard-intel` | Dashboard, EPSS page, CVEQL | W2, W3 |
| W5 | `agent-xdb` | Раздел Exploit DB (формат VulnCheck XDB) | W2, W3 |
| W6 | `agent-settings` | Настройки: уведомления, безопасность, интеграции, API keys | W1 |
| W7 | `agent-tickets` | Внутренняя система заявок | W1, W3 |
| W8 | `agent-hardening` | Audit UX, rate limits, backup/export, docs, E2E, deploy guide | all |

Промпты субагентов: `docs/agents/W0_*.md` … `docs/agents/W8_*.md`.  
Продуктовая спецификация: `docs/PRODUCT_SPEC.md`.  
Статус: `docs/STATUS.md`.

---

## 5. Оркестрация (как запускать субагентов)

```
Для каждой волны Wn:
  1. Прочитай docs/PRODUCT_SPEC.md + docs/agents/Wn_*.md + docs/STATUS.md
  2. Проверь, что зависимости Wn закрыты (DoD предыдущих волн)
  3. Запусти субагента ТОЛЬКО с промптом Wn (не весь продукт сразу)
  4. После мержа — обнови STATUS.md, зафиксируй API contracts
  5. Только затем стартуй Wn+1
```

**Запрещено:** параллельно пилить search и tickets на пустой схеме.  
**Разрешено:** параллелить только независимые куски внутри одной волны (например FE страница + BE endpoint), если контракт уже согласован.

---

## 6. Acceptance всего продукта (exit criteria)

- [ ] Login / logout / 2FA / смена пароля / approval регистрации
- [ ] RBAC: минимум роли Admin, Analyst, Viewer + группы AD
- [ ] NVD sync по API key, auto-update, import/export
- [ ] BDU upload → parse → merge в CVE или отдельная карточка
- [ ] Search по CVE и BDU; KEV подсветка
- [ ] Карточка CVE со всеми ключевыми секциями + блок БДУ
- [ ] Dashboard, EPSS, CVEQL
- [ ] Раздел XDB (табличный поиск exploits)
- [ ] Settings: профиль, пользователи, уведомления, безопасность, БД, интеграции, API keys
- [ ] Система заявок (создание из CVE, статусы, назначения)
- [ ] Docker Compose up + seed admin + smoke E2E
- [ ] Установка на чистой РЕД ОС minimal через `deploy/redos/install.sh` с отчётом

---

## 7. Стартовый промпт оркестратору (копировать)

```
Ты оркестратор VBXSystem. Работай медленно и системно.
1) Прочитай docs/MASTER_PROMPT.md, docs/PRODUCT_SPEC.md, docs/STATUS.md.
2) Определи следующую незакрытую волну Wn.
3) Запусти субагента строго по docs/agents/Wn_*.md.
4) Не начинай следующую волну, пока DoD текущей не выполнен.
5) UI стилистика — cvefeed.io, бренд VBX, язык UI — русский.
6) Референс Database settings: docs/references/settings-database-nvd.png (+ зеркальный блок BDU).
Цель: enterprise on-prem vulnerability intelligence platform, не прототип.
```
